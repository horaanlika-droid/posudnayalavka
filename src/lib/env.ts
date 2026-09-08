// Central, typed access to environment configuration.
// No secrets are stored in code — everything comes from the host env.
// Empty payment keys => the app runs in SIMULATION mode so the flow is
// testable end-to-end before real credentials are plugged in.

function str(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function num(name: string, fallback = 0): number {
  const raw = str(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  publicUrl: str("PUBLIC_URL", "http://localhost:3000").replace(/\/$/, ""),
  port: num("PORT", 3000),

  botToken: str("BOT_TOKEN"),
  adminId: num("ADMIN_ID", 0),
  botMode: str("BOT_MODE", "polling") as "polling" | "webhook",
  botWebhookSecret: str("BOT_WEBHOOK_SECRET"),

  currency: str("CURRENCY", "RUB"),

  // GRM (Gram) wallet — insert credentials on host.
  grmApiBase: str("GRM_API_BASE"),
  grmApiKey: str("GRM_API_KEY"),
  grmReceiver: str("GRM_RECEIVER"),

  // YooKassa — insert credentials on host.
  yookassaShopId: str("YOOKASSA_SHOP_ID"),
  yookassaSecretKey: str("YOOKASSA_SECRET_KEY"),

  // Legal-entity invoice requisites.
  org: {
    name: str("ORG_NAME"),
    inn: str("ORG_INN"),
    kpp: str("ORG_KPP"),
    bik: str("ORG_BIK"),
    account: str("ORG_ACCOUNT"),
    corrAccount: str("ORG_CORR_ACCOUNT"),
    bank: str("ORG_BANK"),
    address: str("ORG_ADDRESS"),
    phone: str("ORG_PHONE"),
    email: str("ORG_EMAIL"),
    ceo: str("ORG_CEO"),
    basis: str("ORG_BASIS", "Устав"),
  },
};

/** True when a given payment method has real credentials configured. */
export function isConfigured(method: "gram" | "yookassa"): boolean {
  if (method === "gram") {
    return Boolean(env.grmApiBase && env.grmReceiver);
  }
  if (method === "yookassa") {
    return Boolean(env.yookassaShopId && env.yookassaSecretKey);
  }
  return false;
}

export function isSimulation(): boolean {
  return !isConfigured("gram") && !isConfigured("yookassa");
}
