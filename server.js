const express = require("express");
const app = express();
const PORT = 3000;

// Middleware
app.use(express.static("public"));
app.use(express.json());

const tables = {};

// ✅ Sipariş alma
app.post("/api/order", (req, res) => {
  const { tableId, items } = req.body;
  if (!tableId || !items || !items.length) {
    return res.status(400).json({ error: "Geçersiz sipariş" });
  }

  if (!tables[tableId]) {
    tables[tableId] = { orders: [] };
  }

  tables[tableId].orders.push({
    items,
    time: Date.now()
  });

  res.sendStatus(200);
});

// ✅ Tüm masaları getir (admin)
app.get("/api/tables", (req, res) => {
  res.json(tables);
});

// ✅ Masa hesabı kapatma (TEK VE NET)
app.post("/api/close", (req, res) => {
  console.log("✅ CLOSE GELDİ:", req.body);

  const { tableId } = req.body;
  if (!tableId || !tables[tableId]) {
    return res.sendStatus(400);
  }

  delete tables[tableId];
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log("🚀 Server çalışıyor: http://localhost:3000");
});
