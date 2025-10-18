import { useState, useEffect, useMemo, useDeferredValue, useRef } from "react";

// The code is quite messy since it was just for prototyping.
function App() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("apiKey") || ""
  );
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [sports, setSports] = useState<{ key: string; title: string }[]>([]);
  const [selectedSport, setSelectedSport] = useState<string | undefined>(
    undefined
  );
  const [events, setEvent] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalStakeInput, setTotalStake] = useState("100");
  const totalStake = useDeferredValue(Number(totalStakeInput) || 0);
  const isMounted = useRef(false);

  const handleInvalidApiKey = () => {
    localStorage.removeItem("apiKey");
    setApiKey("");
    alert("Invalid API key. Please enter a valid one.");
    setLoading(false);
  };

  // Fetch sports
  useEffect(() => {
    if (!apiKey || isMounted.current) return;
    isMounted.current = true;
    setLoading(true);
    fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${apiKey}`)
      .then((res) => {
        if (res.status === 401) {
          handleInvalidApiKey();
          return;
        }
        return res.json();
      })
      .then((data) => {
        setSports(data.filter((e: any) => !e.key.endsWith("winner")));
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching sports:", err);
        setLoading(false);
      });
  }, [apiKey]);

  useEffect(() => {
    if (!selectedSport) return;
    setLoading(true);
    fetch(
      `https://api.the-odds-api.com/v4/sports/${selectedSport}/odds?apiKey=${apiKey}&regions=us,uk,eu,au&markets=h2h&oddsFormat=decimal`
    )
      .then((res) => {
        if (res.status === 401) {
          handleInvalidApiKey();
          return;
        }
        return res.json();
      })
      .then((data) => {
        setEvent(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [selectedSport]);

  type Stake = {
    bookmaker: string;
    stake: number;
    profit: number;
  };

  type ArbitrageResult = {
    homeTeam: string;
    awayTeam: string;
    arbitrage: {
      stakeA: Stake;
      stakeB: Stake;
    };
  };

  const data = useMemo(() => {
    const arbitrageMap = new Map<string, ArbitrageResult>();
    for (const event of events) {
      const bookmakers = event.bookmakers;
      for (let i = 0; i < bookmakers.length; i++) {
        for (let j = i + 1; j < bookmakers.length; j++) {
          if (bookmakers[i].title === bookmakers[j].title) continue;
          const outcomeA = bookmakers[i].markets[0].outcomes;
          const outcomeB = bookmakers[j].markets[0].outcomes;

          const arbitrageResultDiagnoalOne = arbitrage(
            outcomeA[0],
            outcomeB[1]
          );

          const arbitrageResultDiagnoalTwo = arbitrage(
            outcomeA[1],
            outcomeB[0]
          );

          let selectedArbitrage = null;

          if (
            arbitrageResultDiagnoalOne.exits &&
            arbitrageResultDiagnoalTwo.exits
          ) {
            // Both exist, pick the higher profit
            selectedArbitrage =
              arbitrageResultDiagnoalOne.profit! >=
              arbitrageResultDiagnoalTwo.profit!
                ? { result: arbitrageResultDiagnoalOne, type: "one" }
                : { result: arbitrageResultDiagnoalTwo, type: "two" };
          } else if (arbitrageResultDiagnoalOne.exits) {
            selectedArbitrage = {
              result: arbitrageResultDiagnoalOne,
              type: "one",
            };
          } else if (arbitrageResultDiagnoalTwo.exits) {
            selectedArbitrage = {
              result: arbitrageResultDiagnoalTwo,
              type: "two",
            };
          }

          // Push if any exists
          if (selectedArbitrage) {
            const { result, type } = selectedArbitrage;

            let stakeA, stakeB;
            if (type === "one") {
              stakeA = {
                bookmaker: `${bookmakers[i].title} - ${outcomeA[0].name}`,
                stake: result.stakeA,
                profit: result.profit,
              };
              stakeB = {
                bookmaker: `${bookmakers[j].title} - ${outcomeB[1].name}`,
                stake: result.stakeB,
                profit: result.profit,
              };
            } else {
              stakeA = {
                bookmaker: `${bookmakers[i].title} - ${outcomeA[1].name}`,
                stake: result.stakeA,
                profit: result.profit,
              };
              stakeB = {
                bookmaker: `${bookmakers[j].title} - ${outcomeB[0].name}`,
                stake: result.stakeB,
                profit: result.profit,
              };
            }
            const key = `${event.home_team}-${event.away_team}-${stakeA.bookmaker}-${stakeB.bookmaker}-${stakeA.stake}-${stakeB.stake}`;
            arbitrageMap.set(key, {
              homeTeam: event.home_team,
              awayTeam: event.away_team,
              arbitrage: { stakeA, stakeB } as any,
            });
          }
        }
      }
    }
    return Array.from(arbitrageMap.entries())
      .map(([key, value]) => {
        return { key, ...value };
      })
      .sort((a, b) => b.arbitrage.stakeA.profit - a.arbitrage.stakeA.profit);
  }, [events]);

  if (!apiKey) {
    return (
      <div className="h-screen flex flex-col gap-2 justify-center items-center">
        <input
          type="text"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          className="border-2 border-green-200 rounded px-2 py-1 text-green-200 outline-none w-64"
          placeholder="Enter your API key"
        />
        <button
          className="p-2 rounded cursor-pointer border-2 hover:border-transparent border-green-950 bg-transparent hover:bg-green-800"
          onClick={() => {
            setApiKey(apiKeyInput);
            localStorage.setItem("apiKey", apiKeyInput);
          }}
        >
          Save API Key
        </button>
      </div>
    );
  }

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="p-10">
      <div className="mb-5">
        <label className="text-green-200 font-semibold mr-2">
          Select Sport:
        </label>
        <select
          value={selectedSport}
          onChange={(e) => setSelectedSport(e.target.value)}
          className="border-2 border-green-200 rounded px-2 py-1 text-green-200 outline-none"
        >
          {sports.map((sport) => (
            <option key={sport.key} value={sport.key} className="text-black">
              {sport.title}
            </option>
          ))}
        </select>
      </div>

      {selectedSport && (
        <>
          <label className="text-green-200 font-semibold">Total stake: </label>
          <input
            className="border-2 border-green-200 outline-none rounded indent-1 text-green-200 
              focus:ring-1 focus:ring-green-300 transition-all duration-200
              before:content-['$'] before:absolute-0 before:w-fit before:inset-0
              "
            value={totalStakeInput}
            type="number"
            onChange={(e) => setTotalStake(e.target.value)}
          />
          <ol className="mt-5 space-y-5">
            {data.map(
              (event) =>
                !!Math.floor(event.arbitrage.stakeA.profit * totalStake) && (
                  <li
                    key={
                      event.homeTeam +
                      event.awayTeam +
                      event.arbitrage.stakeA.stake +
                      event.arbitrage.stakeB.stake +
                      event.arbitrage.stakeA.bookmaker +
                      event.arbitrage.stakeB.bookmaker
                    }
                  >
                    <p>
                      {event.homeTeam} vs. {event.awayTeam}
                    </p>
                    <div className="ml-6">
                      <p>
                        Stake A: {event.arbitrage.stakeA.bookmaker} $
                        {(event.arbitrage.stakeA.stake * totalStake).toFixed(2)}
                      </p>
                      <p>
                        Stake B: {event.arbitrage.stakeB.bookmaker} $
                        {(event.arbitrage.stakeB.stake * totalStake).toFixed(2)}
                      </p>
                      <p>
                        profit: $
                        {(event.arbitrage.stakeA.profit * totalStake).toFixed(
                          2
                        )}
                      </p>
                    </div>
                  </li>
                )
            )}
          </ol>
        </>
      )}
    </div>
  );
}

function arbitrage(OddA: Outcome, OddB: Outcome) {
  const A = 1 / OddA.price;
  const B = 1 / OddB.price;
  const totalOdd = A + B;
  if (totalOdd < 1) {
    const stakeA = A / totalOdd;
    const stakeB = B / totalOdd;
    return { exits: true, stakeA, stakeB, profit: 1 - totalOdd };
  }

  return { exits: false };
}

export default App;

type Outcome = {
  name: string;
  price: number;
  point?: number;
};

type Market = {
  key: string;
  last_update: string; // ISO string
  outcomes: Outcome[];
};

type Bookmaker = {
  key: string;
  title: string;
  last_update: string;
  markets: Market[];
};

type Event = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
};
