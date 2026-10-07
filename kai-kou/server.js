import "./backend/runtime/load-local-env.js";
import cors from "cors";
import express from "express";

import registerWithCodeHandler from "./api/auth/register-with-code.js";
import sendRegisterCodeHandler from "./api/auth/send-register-code.js";
import agentChatHandler from "./api/agent/chat.js";
import agentDailySuggestionHandler from "./api/agent/daily-suggestion.js";
import agentPlanHandler from "./api/agent/plan.js";
import agentSessionHandler from "./api/agent/session.js";
import healthHandler from "./api/health.js";
import questionsHandler from "./api/questions.js";
import scoreHandler from "./api/score.js";

const app = express();

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.options("/api/score", scoreHandler);
app.post("/api/score", scoreHandler);
app.options("/api/agent/chat", agentChatHandler);
app.post("/api/agent/chat", agentChatHandler);
app.options("/api/agent/daily-suggestion", agentDailySuggestionHandler);
app.post("/api/agent/daily-suggestion", agentDailySuggestionHandler);
app.options("/api/agent/plan", agentPlanHandler);
app.get("/api/agent/plan", agentPlanHandler);
app.post("/api/agent/plan", agentPlanHandler);
app.delete("/api/agent/plan", agentPlanHandler);
app.options("/api/agent/session", agentSessionHandler);
app.get("/api/agent/session", agentSessionHandler);
app.post("/api/agent/session", agentSessionHandler);
app.delete("/api/agent/session", agentSessionHandler);
app.options("/api/auth/send-register-code", sendRegisterCodeHandler);
app.post("/api/auth/send-register-code", sendRegisterCodeHandler);
app.options("/api/auth/register-with-code", registerWithCodeHandler);
app.post("/api/auth/register-with-code", registerWithCodeHandler);
app.all("/api/health", healthHandler);
app.get("/api/questions", questionsHandler);
app.get("/api/questions/:type", questionsHandler);

const defaultPort = 3000;
const requestedPort = Number(process.env.PORT || process.env.API_PORT || defaultPort);
const port = Number.isFinite(requestedPort) && requestedPort > 0 ? Math.floor(requestedPort) : defaultPort;

const server = app.listen(port, () => {
  console.log(`[api] server running at http://localhost:${port}`);
  console.log("[api] ready route: POST /api/score");
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`[api] port ${port} is already in use. Set API_PORT to another value (for example 3001).`);
  } else {
    console.error("[api] server startup failed:", error);
  }
  process.exit(1);
});
