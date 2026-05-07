async function test() {
  const query = `
[out:json][timeout:25];
node["amenity"="school"](50.0,25.0,50.2,25.2);
out body 5;
`;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
      "Accept": "application/json, text/plain, */*",
      "User-Agent": "real-estate-db-test/1.0"
    },
    body: query
  });

  console.log("STATUS:", response.status, response.statusText);
  console.log(await response.text());
}

test().catch(console.error);