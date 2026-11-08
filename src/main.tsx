import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/theme.css";
import "./styles/shell.css";
import App from "./App";
import { DeskApp } from "./shell/desk/DeskApp";

// The same page serves Lemma's desktop window (see src-tauri/src/desk.rs).
const desk = new URLSearchParams(location.search).has("desk");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{desk ? <DeskApp /> : <App />}</React.StrictMode>,
);
