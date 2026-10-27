const express = require("express");
const app = express();
const PORT = 3000;

const users = [
  { id: 1, name: "Aman" },
  { id: 2, name: "Riya" },
  { id: 3, name: "Karan" },
];

// 1. LOGGER MIDDLEWARE
const logger = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const time = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${time}ms)`
    );
  });
  next();
};

// 2. HEADER MIDDLEWARE
const checkHeader = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    return res.status(400).json({ error: "x-api-key header is missing" });
  }
  if (apiKey !== "12345") {
    return res.status(401).json({ error: "Invalid API key" });
  }
  next();
};

// 3. URL PARAMETER MIDDLEWARE
app.param("id", (req, res, next, id) => {
  const userId = Number(id);

  if (Number.isNaN(userId)) {
    return res.status(400).json({ error: "id must be a number" });
  }

  const user = users.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: `User with id ${id} not found` });
  }

  req.user = user;
  next();
});

app.use(logger);

app.get("/", (req, res) => {
  res.send("Welcome!");
});

app.get("/users", checkHeader, (req, res) => {
  res.json(users);
});

app.get("/users/:id", checkHeader, (req, res) => {
  res.json(req.user);
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});