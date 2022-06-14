# webrtc-orderscreen


Start signaling server
```
deno run  --unstable --allow-env --allow-net --allow-read --watch main.ts
```


Start "hosting" by providing a token and a room #hash. Example:
```
http://localhost:8000/server?token=test#9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
```


Join the room from another tab using the url
```
http://localhost:8000/#9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
```
