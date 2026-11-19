import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { TimersProvider } from "./timers";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TimersProvider>
      <App />
    </TimersProvider>
  </StrictMode>
);
