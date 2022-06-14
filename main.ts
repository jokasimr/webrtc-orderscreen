import { serve } from "https://deno.land/std@0.140.0/http/server.ts";

const hosts: Map<string, WebSocket> = new Map();
const waiting: Map<string, (answer: any) => void> = new Map();

const waitForAnswer = (id: string, room: string, offer: any) => {
  const host = hosts.get(room);
  if (host) host.send(JSON.stringify({id, offer}));
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      waiting.delete(id);
      reject();
    }, 10000);
    waiting.set(id, resolve);
  });
}

//const clientsChannel = new BroadcastChannel("clients");


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

        const id = crypto.randomUUID();
        return waitForAnswer(id, room, offer)
          .then(answer =>
            new Response(JSON.stringify(answer), {
              headers: {"content-type": "application/json"},
            })
          )
          .catch(() => new Response("No answer", { status: 404 }));
      }

      if (url.pathname.match(/^\/clients\/?$/)) {
        console.log("received a connection");
        const token = url.searchParams.get("token");
        const room = url.searchParams.get("room");
        if (!token)
          return new Response("Must specify a token", { status: 400 });
        if (!room)
          return new Response("Must specify a room", { status: 400 });
        const hexDigestToken = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
          .then(buf => Array.from(new Uint8Array(buf)))
          .then(arr => arr.map(b => b.toString(16).padStart(2, '0')).join(''));

        console.log(room, hexDigestToken, token);
        if (room != hexDigestToken)
          return new Response("Unauthorized", { status: 403 });

        const upgrade = req.headers.get("upgrade") || "";
        if (upgrade.toLowerCase() != "websocket")
          return new Response("request isn't trying to upgrade to websocket.");

        const { socket, response } = Deno.upgradeWebSocket(req);
        socket.onopen = () => {
          console.log("socket opened");
          hosts.set(room, socket);
        };
        socket.onmessage = (e) => {
          console.log("socket message:", e.data);
          const {id, answer} = JSON.parse(e.data);
          const resolve = waiting.get(id);
          if (resolve) resolve(answer);
        };
        socket.onerror = (e) => console.log("socket errored:", e);
        socket.onclose = () => {
          console.log("socket closed");
          hosts.delete(room);
        };
        return response;
      
      }
      return new Response("Not found", { status: 404 });
    }

    default:
      return new Response("Invalid method", { status: 405 });
  }
}, { port: 80 });