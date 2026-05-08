const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), "application/json; charset=utf-8");
}

function safeSlug(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getPoiFilePathByCity(city) {
  const slug = safeSlug(city);
  return path.join(DATA_DIR, `poi-${slug}.json`);
}

function getAllPoiFiles() {
  if (!fileExists(DATA_DIR)) return [];

  return fs
    .readdirSync(DATA_DIR)
    .filter((name) => name.toLowerCase().startsWith("poi-") && name.toLowerCase().endsWith(".json"))
    .sort((a, b) => a.localeCompare(b, "ro"));
}

function detectPoiCategory(poi) {
  const type = String(poi.type || "").toLowerCase();
  const category = String(poi.category || "").toLowerCase();
  const subcategory = String(poi.subcategory || "").toLowerCase();
  const amenity = String(poi?.tags?.amenity || "").toLowerCase();
  const healthcare = String(poi?.tags?.healthcare || "").toLowerCase();
  const brand = String(poi?.brand || poi?.tags?.brand || "").toLowerCase();
  const operator = String(poi?.operator || poi?.tags?.operator || "").toLowerCase();
  const name = String(poi?.name || "").toLowerCase();

  if (type === "school" || category === "school") return "school";
  if (type === "church" || category === "church") return "church";
  if (type === "medical" || category === "medical") return "medical";
  if (type === "superbet" || category === "superbet") return "superbet";

  if (
    brand.includes("superbet") ||
    operator.includes("superbet") ||
    name.includes("superbet")
  ) {
    return "superbet";
  }

  if (
    ["school", "kindergarten", "college", "university", "childcare"].includes(amenity) ||
    subcategory === "childcare"
  ) {
    return "school";
  }

  if (amenity === "place_of_worship") {
    return "church";
  }

  if (
    ["hospital", "clinic", "doctors"].includes(amenity) ||
    ["hospital", "clinic", "doctor"].includes(healthcare)
  ) {
    return "medical";
  }

  return "other";
}

function normalizePoiFile(json, fallbackCityName) {
  let pois = [];

  if (Array.isArray(json)) {
    pois = json;
  } else if (Array.isArray(json.pois)) {
    pois = json.pois;
  }

  const normalizedPois = pois.map((poi) => {
    const normalizedType = detectPoiCategory(poi);

    return {
      ...poi,
      lat: Number(poi.lat),
      lon: Number(poi.lon ?? poi.lng),
      lng: Number(poi.lng ?? poi.lon),
      type: normalizedType,
      category: normalizedType
    };
  });

  return {
    city: json.city || fallbackCityName,
    pois: normalizedPois,
    counts: {
      total: normalizedPois.length,
      school: normalizedPois.filter((p) => p.type === "school").length,
      church: normalizedPois.filter((p) => p.type === "church").length,
      medical: normalizedPois.filter((p) => p.type === "medical").length,
      superbet: normalizedPois.filter((p) => p.type === "superbet").length
    }
  };
}

function extractCityDisplayName(json, fallbackFileName) {
  if (json && typeof json.city === "string" && json.city.trim()) {
    return json.city.trim();
  }

  return fallbackFileName
    .replace(/^poi-/i, "")
    .replace(/\.json$/i, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function getCitiesList() {
  const files = getAllPoiFiles();
  const cities = [];

  for (const fileName of files) {
    try {
      const fullPath = path.join(DATA_DIR, fileName);
      const json = readJsonFile(fullPath);
      const displayName = extractCityDisplayName(json, fileName);

      cities.push({
        name: displayName,
        slug: safeSlug(displayName),
        fileName
      });
    } catch {
      // ignorăm fișierele stricate
    }
  }

  cities.sort((a, b) => a.name.localeCompare(b.name, "ro"));
  return cities;
}

function serveStatic(urlPath, res) {
  const requestedPath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.join(PUBLIC_DIR, requestedPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, "Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon"
    };

    send(res, 200, data, types[ext] || "application/octet-stream");
  });
}

const server = http.createServer((req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = reqUrl.pathname;

    if (pathname === "/api/cities" && req.method === "GET") {
      sendJson(res, 200, getCitiesList());
      return;
    }

    if (pathname === "/api/poi" && req.method === "GET") {
      const city = reqUrl.searchParams.get("city");

      if (!city || !city.trim()) {
        sendJson(res, 400, { error: "Lipsește parametrul city." });
        return;
      }

      const filePath = getPoiFilePathByCity(city);

      if (!fileExists(filePath)) {
        sendJson(res, 404, {
          error: `Fișierul pentru orașul "${city}" nu există.`,
          expectedFile: path.basename(filePath),
          availableFiles: getAllPoiFiles()
        });
        return;
      }

      try {
        const parsed = readJsonFile(filePath);
        const normalized = normalizePoiFile(parsed, city);
        sendJson(res, 200, normalized);
      } catch (err) {
        sendJson(res, 500, {
          error: `Eroare la citirea fișierului POI: ${err.message}`
        });
      }

      return;
    }

    serveStatic(pathname, res);
  } catch (err) {
    send(res, 500, `Eroare internă server: ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`Server pornit pe http://localhost:${PORT}`);
});