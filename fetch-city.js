const fs = require("fs");
const path = require("path");

const OVERPASS_URLS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter"
];

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

// MODIFICI DOAR ORAȘUL AICI
const CITY_NAME = "Sighetu Marmației";

function slugify(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const OUTPUT_FILE = path.join(__dirname, "data", `poi-${slugify(CITY_NAME)}.json`);

function ensureDataFolder() {
  const dataDir = path.join(__dirname, "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function textIncludesAny(text, words) {
  const value = String(text || "").toLowerCase();
  return words.some((word) => value.includes(word));
}

function normalizeType(tags = {}) {
  const amenity = String(tags.amenity || "").toLowerCase();
  const healthcare = String(tags.healthcare || "").toLowerCase();
  const shop = String(tags.shop || "").toLowerCase();
  const office = String(tags.office || "").toLowerCase();
  const leisure = String(tags.leisure || "").toLowerCase();

  const name = String(tags.name || "").toLowerCase();
  const brand = String(tags.brand || "").toLowerCase();
  const operator = String(tags.operator || "").toLowerCase();

  const allText = `${name} ${brand} ${operator}`;

  const bettingBrands = [
    "superbet",
    "fortuna",
    "casa pariurilor",
    "stanleybet",
    "get's bet",
    "gets bet",
    "getsbet"
  ];

  const gamingBrands = [
    "maxbet",
    "magic",
    "million",
    "bonus",
    "winbet",
    "winboss",
    "magnum"
  ];

  if (["school", "kindergarten", "college", "university", "childcare"].includes(amenity)) {
    return {
      type: "school",
      subcategory: amenity
    };
  }

  if (amenity === "place_of_worship") {
    return {
      type: "church",
      subcategory: tags.religion || "place_of_worship"
    };
  }

  if (
    ["hospital", "clinic", "doctors"].includes(amenity) ||
    ["hospital", "clinic", "doctor"].includes(healthcare)
  ) {
    return {
      type: "medical",
      subcategory: amenity || healthcare
    };
  }

  if (
    textIncludesAny(allText, gamingBrands) ||
    amenity === "casino" ||
    leisure === "adult_gaming_centre" ||
    leisure === "amusement_arcade"
  ) {
    return {
      type: "gaming",
      subcategory: tags.brand || tags.operator || tags.name || amenity || leisure || "gaming"
    };
  }

  if (
    textIncludesAny(allText, bettingBrands) ||
    amenity === "gambling" ||
    shop === "bookmaker" ||
    office === "bookmaker"
  ) {
    return {
      type: "betting",
      subcategory: tags.brand || tags.operator || tags.name || amenity || shop || "betting"
    };
  }

  return null;
}

function getElementCenter(element) {
  if (element.lat && element.lon) {
    return {
      lat: element.lat,
      lng: element.lon
    };
  }

  if (element.center) {
    return {
      lat: element.center.lat,
      lng: element.center.lon
    };
  }

  return null;
}

async function getCityBbox(cityName) {
  const url =
    `${NOMINATIM_URL}?format=json&limit=1&countrycodes=ro&q=` +
    encodeURIComponent(`${cityName}, România`);

  console.log(`Caut orașul în Nominatim: ${cityName}`);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "real-estate-poi-app/1.0 (contact: local-dev)",
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Eroare Nominatim: ${response.status}`);
  }

  const data = await response.json();

  if (!data.length || !data[0].boundingbox) {
    throw new Error(`Nu am găsit bbox pentru orașul ${cityName}.`);
  }

  const [south, north, west, east] = data[0].boundingbox;
  return `${south},${west},${north},${east}`;
}

function buildQuery(bbox) {
  return `
[out:json][timeout:180];
(
  node["amenity"~"school|kindergarten|college|university|childcare"](${bbox});
  way["amenity"~"school|kindergarten|college|university|childcare"](${bbox});
  relation["amenity"~"school|kindergarten|college|university|childcare"](${bbox});

  node["amenity"="place_of_worship"](${bbox});
  way["amenity"="place_of_worship"](${bbox});
  relation["amenity"="place_of_worship"](${bbox});

  node["amenity"~"hospital|clinic|doctors"](${bbox});
  way["amenity"~"hospital|clinic|doctors"](${bbox});
  relation["amenity"~"hospital|clinic|doctors"](${bbox});

  node["healthcare"~"hospital|clinic|doctor"](${bbox});
  way["healthcare"~"hospital|clinic|doctor"](${bbox});
  relation["healthcare"~"hospital|clinic|doctor"](${bbox});

  node["amenity"~"gambling|casino"](${bbox});
  way["amenity"~"gambling|casino"](${bbox});
  relation["amenity"~"gambling|casino"](${bbox});

  node["shop"="bookmaker"](${bbox});
  way["shop"="bookmaker"](${bbox});
  relation["shop"="bookmaker"](${bbox});

  node["office"="bookmaker"](${bbox});
  way["office"="bookmaker"](${bbox});
  relation["office"="bookmaker"](${bbox});

  node["leisure"~"adult_gaming_centre|amusement_arcade"](${bbox});
  way["leisure"~"adult_gaming_centre|amusement_arcade"](${bbox});
  relation["leisure"~"adult_gaming_centre|amusement_arcade"](${bbox});

  node["name"~"Superbet|Fortuna|Casa Pariurilor|Stanleybet|Get'?s Bet|Maxbet|Magic|Million|Bonus|Winbet|Winboss|Magnum",i](${bbox});
  way["name"~"Superbet|Fortuna|Casa Pariurilor|Stanleybet|Get'?s Bet|Maxbet|Magic|Million|Bonus|Winbet|Winboss|Magnum",i](${bbox});
  relation["name"~"Superbet|Fortuna|Casa Pariurilor|Stanleybet|Get'?s Bet|Maxbet|Magic|Million|Bonus|Winbet|Winboss|Magnum",i](${bbox});

  node["brand"~"Superbet|Fortuna|Casa Pariurilor|Stanleybet|Get'?s Bet|Maxbet|Magic|Million|Bonus|Winbet|Winboss|Magnum",i](${bbox});
  way["brand"~"Superbet|Fortuna|Casa Pariurilor|Stanleybet|Get'?s Bet|Maxbet|Magic|Million|Bonus|Winbet|Winboss|Magnum",i](${bbox});
  relation["brand"~"Superbet|Fortuna|Casa Pariurilor|Stanleybet|Get'?s Bet|Maxbet|Magic|Million|Bonus|Winbet|Winboss|Magnum",i](${bbox});

  node["operator"~"Superbet|Fortuna|Casa Pariurilor|Stanleybet|Get'?s Bet|Maxbet|Magic|Million|Bonus|Winbet|Winboss|Magnum",i](${bbox});
  way["operator"~"Superbet|Fortuna|Casa Pariurilor|Stanleybet|Get'?s Bet|Maxbet|Magic|Million|Bonus|Winbet|Winboss|Magnum",i](${bbox});
  relation["operator"~"Superbet|Fortuna|Casa Pariurilor|Stanleybet|Get'?s Bet|Maxbet|Magic|Million|Bonus|Winbet|Winboss|Magnum",i](${bbox});
);
out center tags;
`;
}

async function fetchFromOverpass(query) {
  let lastError = null;

  for (const url of OVERPASS_URLS) {
    try {
      console.log("");
      console.log(`Încerc Overpass: ${url}`);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": "real-estate-poi-app/1.0 (contact: local-dev)",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "data=" + encodeURIComponent(query)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`Serverul a răspuns cu status ${response.status}`);
        console.log(errorText.slice(0, 500));
        lastError = new Error(`Overpass ${url} status ${response.status}`);
        continue;
      }

      return await response.json();
    } catch (err) {
      console.log(`A eșuat serverul: ${url}`);
      console.log(err.message);
      lastError = err;
    }
  }

  throw lastError || new Error("Toate serverele Overpass au eșuat.");
}

async function fetchPOI() {
  ensureDataFolder();

  const bbox = await getCityBbox(CITY_NAME);

  console.log("BBOX:", bbox);
  console.log("Încep request Overpass...");

  const query = buildQuery(bbox);
  const data = await fetchFromOverpass(query);

  const pois = [];

  for (const element of data.elements || []) {
    const tags = element.tags || {};
    const typeData = normalizeType(tags);
    const center = getElementCenter(element);

    if (!typeData || !center) continue;

    pois.push({
      id: `${element.type}-${element.id}`,
      name: tags.name || tags.brand || tags.operator || "Fără nume",
      type: typeData.type,
      subcategory: typeData.subcategory,
      lat: center.lat,
      lng: center.lng,
      osmType: element.type,
      tags
    });
  }

  const unique = [];
  const seen = new Set();

  for (const poi of pois) {
    const key = `${poi.type}-${poi.name}-${poi.lat.toFixed(6)}-${poi.lng.toFixed(6)}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(poi);
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(unique, null, 2), "utf8");

  console.log("");
  console.log("=== GATA ===");
  console.log(`Oraș: ${CITY_NAME}`);
  console.log(`Total POI: ${unique.length}`);
  console.log(`Școli / creșe / grădinițe: ${unique.filter((p) => p.type === "school").length}`);
  console.log(`Biserici: ${unique.filter((p) => p.type === "church").length}`);
  console.log(`Medical: ${unique.filter((p) => p.type === "medical").length}`);
  console.log(`Pariuri: ${unique.filter((p) => p.type === "betting").length}`);
  console.log(`Gaming / Casino: ${unique.filter((p) => p.type === "gaming").length}`);
  console.log(`Fișier: ${OUTPUT_FILE}`);
}

fetchPOI().catch((error) => {
  console.error("");
  console.error("EROARE FINALĂ:", error.message);
});