export const commands = ["start", "next", "resume-turn", "postpone", "guess", "reveal", "complete", "pause", "resume", "finish"] as const;
export type RevealCommand = (typeof commands)[number];
export type CommandInput = {
  kind: RevealCommand;
  revision: number;
  drawVersion: number | null;
  turnId: string | null;
  guessId: string | null;
  confirmed: boolean;
};
