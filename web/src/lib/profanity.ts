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
];

// Build regex once at module load — match whole-word occurrences, case-insensitive
const pattern = new RegExp(
  `(${BAD_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
  "gi"
);

export function censorText(text: string): string {
  return text.replace(pattern, (match) =>
    match[0] + "*".repeat(Math.max(match.length - 1, 1))
  );
}
