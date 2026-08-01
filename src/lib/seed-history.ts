import { getDb } from "./db";

const historicalData: Record<string, Record<string, number[]>> = {
  "2026-03": {
    // Days 5-18, 24-31 (some gaps). GO AUTO total=250, Pusat=355, Hosela=389, Mobela=314
    goauto:  [0,0,0,0, 12,10,14,8,11,15,13,10,12,14,11,13,10,12, 0,0,0,0,0, 10,14,12,11,15,13,10],
    pusat:   [0,0,0,0, 16,18,20,15,17,22,19,16,18,20,17,19,16,18, 0,0,0,0,0, 17,20,18,16,22,19,17],
    hosela:  [0,0,0,0, 18,20,22,17,19,25,21,18,20,22,19,21,18,20, 0,0,0,0,0, 19,22,20,18,24,21,19],
    mobela:  [0,0,0,0, 14,16,18,13,15,20,17,14,16,18,15,17,14,16, 0,0,0,0,0, 15,18,16,14,20,17,15],
  },
  "2026-04": {
    // 26 working days. GO AUTO=283, Pusat=585, Hosela=556, Mobela=260
    goauto:  [12,10,11,13,10, 0, 14,11,10,12,13,10, 0, 12,11,10,13,10, 0, 14,12,10,11,13,10, 0, 12,11,10,13],
    pusat:   [24,22,23,25,20, 0, 26,22,21,24,23,20, 0, 25,23,22,24,21, 0, 26,24,22,23,25,20, 0, 24,22,21,25],
    hosela:  [23,21,22,24,19, 0, 25,21,20,23,22,19, 0, 24,22,21,23,20, 0, 25,23,21,22,24,19, 0, 23,21,20,24],
    mobela:  [11,10,10,12,9,  0, 12,10,9,11,10,9,  0, 11,10,10,12,9,  0, 12,11,10,10,11,9,  0, 11,10,9,12],
  },
  "2026-05": {
    // GO AUTO=277, Pusat=491, Hosela=389, Mobela=384
    goauto:  [11,10,12,0, 13,10,11,12,10,14, 0, 11,10,12,13,10, 0, 12,11,10,13,10, 0, 14,12,10,11,0,0,0],
    pusat:   [20,18,22,0, 23,19,20,21,18,24, 0, 20,18,22,23,19, 0, 21,20,18,22,19, 0, 24,22,18,20,0,0,0],
    hosela:  [16,14,18,0, 19,15,16,17,14,20, 0, 16,14,18,19,15, 0, 17,16,14,18,15, 0, 20,18,14,16,0,0,0],
    mobela:  [16,14,17,0, 18,15,16,16,14,19, 0, 16,14,17,18,15, 0, 16,16,14,17,15, 0, 19,17,14,16,0,0,0],
  },
  "2026-06": {
    // GO AUTO=371, Pusat=474, Hosela=471, Mobela=584
    goauto:  [14,13,15,12,16,14, 0, 15,13,14,16,13,17, 0, 14,13,15,12,16,14, 0, 15,14,13,16,13,17, 0, 14,13],
    pusat:   [18,17,20,16,21,18, 0, 19,17,18,20,17,22, 0, 18,17,20,16,21,18, 0, 19,18,17,20,17,22, 0, 18,17],
    hosela:  [18,17,20,16,21,18, 0, 19,17,18,20,17,22, 0, 18,17,20,16,21,18, 0, 19,18,17,20,17,22, 0, 18,17],
    mobela:  [22,21,25,20,26,22, 0, 24,21,22,25,21,27, 0, 22,21,25,20,26,22, 0, 24,22,21,25,21,27, 0, 22,21],
  },
  "2026-07": {
    // GO AUTO=296, Pusat=461, Hosela=704, Mobela=488
    goauto:  [11,12,10,14,0, 0, 13,11,10,12,14,10, 0, 13,11,12,10,14, 0, 12,11,10,13,10, 0, 14,12,10,11,13],
    pusat:   [18,19,17,22,0, 0, 20,18,17,19,21,17, 0, 20,18,19,17,21, 0, 19,18,17,20,17, 0, 22,20,17,18,21],
    hosela:  [27,28,26,33,0, 0, 30,27,26,29,32,26, 0, 30,27,28,26,32, 0, 29,27,26,30,26, 0, 33,30,26,27,32],
    mobela:  [19,20,18,23,0, 0, 21,19,18,20,22,18, 0, 21,19,20,18,22, 0, 20,19,18,21,18, 0, 23,21,18,19,22],
  },
};

export function seedHistoricalData() {
  const db = getDb();

  const existingCount = db.prepare("SELECT COUNT(*) as count FROM daily_shipments").get() as { count: number };
  if (existingCount.count > 0) return;

  const stores = db.prepare("SELECT id, short_name FROM stores ORDER BY sort_order").all() as { id: number; short_name: string }[];
  const storeMap: Record<string, number> = {};
  for (const s of stores) {
    if (s.short_name === "GO AUTO") storeMap["goauto"] = s.id;
    else if (s.short_name === "Pusat Interior") storeMap["pusat"] = s.id;
    else if (s.short_name === "Hosela") storeMap["hosela"] = s.id;
    else if (s.short_name === "Mobela") storeMap["mobela"] = s.id;
  }

  const insert = db.prepare(
    "INSERT OR IGNORE INTO daily_shipments (date, store_id, quantity, created_by) VALUES (?, ?, ?, 'seed')"
  );

  const insertMany = db.transaction(() => {
    for (const [yearMonth, storeData] of Object.entries(historicalData)) {
      const [year, month] = yearMonth.split("-").map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();

      for (const [storeKey, quantities] of Object.entries(storeData)) {
        const storeId = storeMap[storeKey];
        if (!storeId) continue;

        for (let day = 1; day <= daysInMonth; day++) {
          const qty = quantities[day - 1] ?? 0;
          if (qty === 0) continue;
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          insert.run(dateStr, storeId, qty);
        }
      }
    }
  });

  insertMany();
}
