import "./finance.css";
import { Wallet } from "lucide-react";
import type { ExtensionManifest } from "../../extensions/types";
import { FinanceSidebar } from "./FinanceSidebar";
import { FinanceSummary } from "./FinanceSummary";
import { FinanceView } from "./FinanceView";

export const finance: ExtensionManifest = {
  id: "finance",
  name: "Finance",
  description: "What comes in and goes out, budgets, recurring bills and statement imports, end-to-end encrypted.",
  about: [
    "See where your money goes. Add income and spending in one line (“12.50 coffee yesterday”), or import statements from your bank and credit card. Set a monthly budget for the categories that matter and watch what's left.",
    "Salary, rent and subscriptions come round each month ready to confirm with a click. Accounts can be in any currency, converted to yours at each day's rate. Synced end-to-end encrypted: only your devices can read your finances, never the server.",
  ],
  features: [
    "Quick entry in plain words: amount, payee, date, #category and @account",
    "Import CSV, OFX, QFX and QIF statements from any bank or credit card; duplicates are caught",
    "Learns your categories from how you sort payees",
    "Monthly budgets per category, with what's left",
    "Recurring income and bills to confirm each time they come round",
    "Current, savings, credit card and cash accounts in any currency",
    "Twelve-month trends and net worth",
    "End-to-end encrypted sync, with a recovery code",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Wallet,
  color: "var(--area-finance)",
  area: { View: FinanceView, Summary: FinanceSummary, Sidebar: FinanceSidebar },
};
