import "server-only";

import { getOptionalServerEnv, getRequiredServerEnv } from "@/lib/env.server";

type SendResult = {
  sent: boolean;
  provider: string;
  error?: string;
};

export async function sendWhatsAppMessage(
  to: string,
  body: string
): Promise<SendResult> {
  const provider = (getOptionalServerEnv("WHATSAPP_PROVIDER") || "none").toLowerCase();

  if (provider === "none") {
    return { sent: false, provider, error: "Provider disabled" };
  }

  if (provider !== "twilio") {
    return { sent: false, provider, error: "Unsupported provider" };
  }

  const accountSid = getRequiredServerEnv("TWILIO_ACCOUNT_SID");
  const authToken = getRequiredServerEnv("TWILIO_AUTH_TOKEN");
  const from = getRequiredServerEnv("TWILIO_WHATSAPP_FROM");

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const payload = new URLSearchParams({
    To: formatWhatsappRecipient(to),
    From: from,
    Body: body,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload,
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      sent: false,
      provider,
      error: `Twilio request failed (${response.status}): ${errorText}`,
    };
  }

  return { sent: true, provider };
}

function formatWhatsappRecipient(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("whatsapp:")) {
    return trimmed;
  }
  if (trimmed.startsWith("+")) {
    return `whatsapp:${trimmed}`;
  }

  const digitsOnly = trimmed.replace(/\D/g, "");
  const defaultCountryCode = (getOptionalServerEnv("WHATSAPP_DEFAULT_COUNTRY_CODE") || "")
    .replace(/\D/g, "");

  if (defaultCountryCode) {
    return `whatsapp:+${defaultCountryCode}${digitsOnly}`;
  }

  return `whatsapp:+${digitsOnly}`;
}
