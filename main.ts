import { serve } from "https://deno.land/std@0.140.0/http/server.ts";

type RoomId = string;
const channels: Map<RoomId, BroadcastChannel> = new Map();
const hosts: Map<RoomId, WebSocket> = new Map();

type ClientId = string;
const waiting: Map<ClientId, (answer: any) => void> = new Map();

const waitForAnswer = (id: ClientId, room: RoomId, offer: any) => {
  return new Promise((resolve, reject) => {
    console.log(`client ${id} waiting on ${room}`);
    setTimeout(() => {
      waiting.delete(id);
      reject();
    }, 10000);

    if (hosts.has(room)) {
      console.log(`\t my host, questioning.`);
      hosts.get(room)?.send(JSON.stringify({id, offer}));
    } else {
      const channel = new BroadcastChannel(room);
      console.log(`\t forwarding question.`);
      channel.postMessage({id, offer});
      channel.onmessage = ({data}) => {
        if (data.id === id) {
          console.log(`client ${id} received channel message`);
          console.log(`\t answer from ${room}`);
          console.log(`\t forwarding answer.`);
          resolve(data.answer);
          channel.close();
        }
      }
    }
    waiting.set(id, resolve);
  });
};

serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  switch (req.method) {
    case "GET": {

      if (url.pathname.match(/^\/?$/)) {
        const file = await Deno.readFile("./index.html");
        return new Response(file, {
          headers: {"content-type": "text/html"},
        });
      }
      if (url.pathname.startsWith("/server")) {
        const file = await Deno.readFile("./server.html");
        return new Response(file, {
          headers: {"content-type": "text/html"},
        });
      }

      if (url.pathname.match(/^\/connect\/?$/)) {
        const offer = url.searchParams.get("offer");
        const room = url.searchParams.get("room");
        if (!offer) return new Response("No offer made", { status: 400 });
        if (!room) return new Response("No room specified", { status: 400 });

        const id: ClientId = crypto.randomUUID();
        return waitForAnswer(id, room, offer)
          .then(answer =>
            new Response(JSON.stringify(answer), {
              headers: {"content-type": "application/json"},
            })
          )
          .catch(() => new Response("No answer", { status: 404 }));
      }

      if (url.pathname.match(/^\/clients\/?$/)) {
        console.log("received host connection request");
        const token = url.searchParams.get("token");
        const room = url.searchParams.get("room");
        if (!token)
          return new Response("Must specify a token", { status: 400 });
        if (!room)
          return new Response("Must specify a room", { status: 400 });
        const hexDigestToken = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
          .then(buf => Array.from(new Uint8Array(buf)))
          .then(arr => arr.map(b => b.toString(16).padStart(2, '0')).join(''));

        if (room != hexDigestToken)
          return new Response("Unauthorized", { status: 403 });

        const upgrade = req.headers.get("upgrade") || "";
        if (upgrade.toLowerCase() != "websocket")
          return new Response("request isn't trying to upgrade to websocket.");

        const { socket, response } = Deno.upgradeWebSocket(req);
        const channel = new BroadcastChannel(room);
        socket.onopen = () => {
          console.log(`host ${room} open:`);
          hosts.set(room, socket);
          channel.onmessage = ev => {
            console.log(`host ${room} channel message:`);
            console.log(`\t question from ${ev.data.id}`);
            console.log(`\t forwarding question.`);
            hosts.get(room)?.send(JSON.stringify(ev.data));
          };
          channels.set(room, channel);
        };
        socket.onmessage = (e) => {
          console.log(`host ${room} message:`);
          const {id, answer} = JSON.parse(e.data);
          console.log(`\t answer to ${id}`);
          if (waiting.has(id)) {
            console.log(`\t my client, answering.`);
            waiting.get(id)?.(answer);
          }
          else {
            console.log(`\t forwarding answer.`);
            channel.postMessage({id, answer});
          }
        };
        socket.onerror = (e) => console.log(`host ${room} error: ${e}`);
        socket.onclose = () => {
          console.log(`host ${room} close.`);
          hosts.delete(room);
          channels.get(room)?.close();
          channels.delete(room);
        };
        return response;
      }

      return new Response("Not found", { status: 404 });
    }

    default:
      return new Response("Invalid method", { status: 405 });
  }
});