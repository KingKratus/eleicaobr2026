// Códigos de cargo conforme TSE
export const CARGOS: Record<number, { nome: string; sigla: string; tipo: "majoritario" | "proporcional" }> = {
  1: { nome: "Presidente", sigla: "PR", tipo: "majoritario" },
  3: { nome: "Governador", sigla: "GO", tipo: "majoritario" },
  5: { nome: "Senador", sigla: "SE", tipo: "majoritario" },
  6: { nome: "Deputado Federal", sigla: "DF", tipo: "proporcional" },
  7: { nome: "Deputado Estadual", sigla: "DE", tipo: "proporcional" },
  8: { nome: "Deputado Distrital", sigla: "DD", tipo: "proporcional" },
  11: { nome: "Prefeito", sigla: "PM", tipo: "majoritario" },
  13: { nome: "Vereador", sigla: "VE", tipo: "proporcional" },
};

export const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO","ZZ"
] as const;

export type UF = typeof UFS[number];
