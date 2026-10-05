import { Router, type IRouter } from "express";

const router: IRouter = Router();

type MassiveBar = {
  c: number;
  t: number;
  v: number;
};

type MassiveResponse = {
  status?: string;
  ticker?: string;
  results?: MassiveBar[];
  error?: string;
};

router.get("/market-context", async (req, res) => {
  const apiKey = process.env.MASSIVE_API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: "Massive API key is not configured" });
    return;
  }

  const rawTicker = typeof req.query.ticker === "string" ? req.query.ticker.trim() : "";
  if (!rawTicker) {
    res.status(400).json({ error: "Ticker is required" });
    return;
  }

  const ticker = rawTicker.toUpperCase();
  const allowedTickers = new Set(["MSFT", "NVDA", "SMR", "AAPL"]);
  if (!allowedTickers.has(ticker)) {
    res.status(400).json({ error: "Unsupported ticker" });
    return;
  }

  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - 1);

  const to = toDate.toISOString().slice(0, 10);
  const from = fromDate.toISOString().slice(0, 10);

  const url =
    `https://api.massive.com/v2/aggs/ticker/${ticker}` +
    `/range/1/day/${from}/${to}` +
  `?adjusted=true&sort=asc&limit=500`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const data = (await response.json()) as MassiveResponse;

    if (!response.ok) {
      console.error("[market-context] Massive error:", data);
      res.status(502).json({
        error: "Unable to load market data",
      });
      return;
    }

    const results = Array.isArray(data.results) ? data.results : [];

    const points = results
      .filter(
        (bar) =>
          typeof bar.c === "number" &&
          typeof bar.t === "number",
      )
      .map((bar) => ({
        date: new Date(bar.t).toISOString().slice(0, 10),
        close: bar.c,
        volume: bar.v,
      }));

    const firstClose = points[0]?.close ?? null;
    const latestClose = points.at(-1)?.close ?? null;

    const changePct =
      firstClose !== null && latestClose !== null
        ? ((latestClose - firstClose) / firstClose) * 100
        : null;

    res.json({
      ticker,
      from,
      to,
      latestClose,
      changePct,
      points,
    });
  } catch (error) {
    console.error("[market-context] Request failed:", error);

    res.status(500).json({
      error: "Unable to load market data",
    });
  }
});

export default router;