const BAD_WORDS = [
  // Español — mexicanismos y generales
  "puta", "puto", "putas", "putos",
  "pinche", "pinches",
  "chinga", "chingas", "chingada", "chingadas", "chingado", "chingados", "chinguen", "chingue",
  "cabrón", "cabron", "cabrona", "cabrones", "cabronas",
  "pendejo", "pendeja", "pendejos", "pendejas",
  "mamón", "mamon", "mamones", "mamona", "mamonas",
  "culero", "culera", "culeros", "culeras",
  "wey", "güey", "guey",
  "verga", "vergas",
  "perra", "perras",
  "idiota", "idiotas",
  "imbécil", "imbecil", "imbéciles", "imbeciles",
  "estúpido", "estupido", "estúpida", "estupida", "estúpidos", "estupidos",
  "mierda",
  "coño", "cono",
  "joder",
  "hostia",
  "hijo de puta", "hija de puta",
  "chingada madre",
  "vete a la chingada",
  "me cago",
  "marica", "maricas",
  "perra madre",
  "put@", "cul@",
  // Insultos adicionales
  "pito", "pitos",
  "joto", "jotos",
  "maricón", "maricon", "maricones", "maricona", "mariconas",
  "jotito", "jotitos",
  "putito", "putitos",
  "culito",
  "ojete", "ojetes",
  "naco", "nacos", "naca", "nacas",
  "güey", "buey",
  "cholo", "cholos",
  "panocha", "panochita",
  "choto", "chotos",
  "huevón", "huevon", "huevones",
  "güevón", "guevon",
  "cagate", "cagada",
  "cagar",
  "mamada", "mamadas",
  "chupame",
  "pinches",
  // English
  "fuck", "fucker", "fucking", "fucked",
  "shit", "bullshit",
  "bitch", "bitches",
  "asshole", "ass",
  "cunt",
  "bastard",
  "dick", "dicks",
  "cock",
  "whore",
  "nigger", "nigga",
  "faggot", "fag",
  "retard",
];

const LETTER = "[a-záéíóúüñA-ZÁÉÍÓÚÜÑA-Za-z0-9_]";
// Build regex once at module load — use lookahead/lookbehind word boundaries
// that handle Spanish accented characters correctly.
const pattern = new RegExp(
  `(?<!${LETTER})(${BAD_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?!${LETTER})`,
  "giu"
);

export function censorText(text: string): string {
  return text.replace(pattern, (match) => "*".repeat(match.length));
}
