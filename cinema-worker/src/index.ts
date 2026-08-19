/// <reference types="@cloudflare/workers-types" /> note

const VERSION = "1.0.0";

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        app: "FWG-Cinema",
        version: VERSION,
        timestamp: new Date().toISOString(),
      });
    }

    return new Response(CINEMA_HTML, {
      headers: {
        "Content-Type": "text/html;charset=UTF-8",
        "X-Powered-By": "FWG-UltraEdge Cinema 🎬",
        "X-Version": VERSION,
        "Cache-Control": "public, max-age=3600",
      },
    });
  },
} satisfies ExportedHandler;

const CINEMA_HTML = `<!DOCTYPE html>
<html lang="km">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="theme-color" content="#080810"/>
<title>FWG Cinema 🎬</title>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body style="margin:0;background:#080810">
<div id="root"></div>
<script type="text/babel" data-type="module">
// Re-export from existing file
export { default } from "../handlers/cinema";

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(FWGCinematicHub)
);
</script>
</body>
</html>`;
