import "server-only";

type WinnerMessageParams = {
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  points: number;
};

type JoinRequestMessageParams = {
  groupName: string;
  requestedName: string;
  requestedPhone: string;
  approveLink?: string;
  rejectLink?: string;
};

type JoinDecisionMessageParams = {
  groupName: string;
  status: "approved" | "rejected";
};

type PredictionReminderMessageParams = {
  groupName: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
};

export function buildWinnerMessage(params: WinnerMessageParams): string {
  return [
    `Ganaste en tu pronostico: ${params.homeTeam} ${params.homeGoals}-${params.awayGoals} ${params.awayTeam}.`,
    `Puntos del partido: ${params.points}.`,
    "Revisa el ranking actualizado en la app.",
  ].join(" ");
}

export function buildJoinRequestMessage(params: JoinRequestMessageParams): string {
  const linksSection =
    params.approveLink && params.rejectLink
      ? ` Aprobar: ${params.approveLink} Rechazar: ${params.rejectLink}`
      : " Entra al panel de admin para aprobar o rechazar.";

  return [
    `Nueva solicitud para tu grupo ${params.groupName}.`,
    `Nombre: ${params.requestedName}.`,
    `Telefono: ${params.requestedPhone}.`,
    linksSection,
  ].join(" ");
}

export function buildJoinDecisionMessage(params: JoinDecisionMessageParams): string {
  if (params.status === "approved") {
    return `Tu solicitud para ${params.groupName} fue aprobada. Ya puedes entrar y hacer tus pronosticos.`;
  }

  return `Tu solicitud para ${params.groupName} fue rechazada por el admin del grupo.`;
}

export function buildPredictionReminderMessage(
  params: PredictionReminderMessageParams
): string {
  return [
    `Recordatorio: ${params.homeTeam} vs ${params.awayTeam} inicia pronto (${params.kickoffAt}).`,
    `Aun no enviaste tu pronostico en el grupo ${params.groupName}.`,
    "Entra a la app para enviarlo antes del bloqueo.",
  ].join(" ");
}
