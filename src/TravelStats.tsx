import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Car, Footprints, LogOut, Map, Route, Search } from "lucide-react";
import { api } from "./api";
import type { TravelMode, TravelStatsPayload, User } from "./types";

const emptyStats: TravelStatsPayload = {
  summary: {
    tripCount: 0,
    totalDistanceMeters: 0,
    walkingDistanceMeters: 0,
    vehicleDistanceMeters: 0
  },
  daily: [],
  monthly: [],
  items: []
};

function formatKilometers(meters: number) {
  return `${(meters / 1000).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} km`;
}

function modeLabel(mode: TravelMode) {
  return mode === "walking" ? "步行" : "乘车";
}

function chartScaleMeters(maxDistanceMeters: number) {
  if (maxDistanceMeters <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(maxDistanceMeters));
  const normalized = maxDistanceMeters / magnitude;
  const niceValue = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceValue * magnitude;
}

function formatChartDistance(meters: number) {
  if (meters >= 1000) return `${Number((meters / 1000).toFixed(1))} km`;
  return `${Math.round(meters)} m`;
}

function formatBarKilometers(meters: number) {
  return (meters / 1000).toFixed(2);
}

export function TravelStats({
  currentUser,
  onShowMap,
  onLogout
}: {
  currentUser: User;
  onShowMap: () => void;
  onLogout: () => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [travelMode, setTravelMode] = useState<TravelMode | "all">("all");
  const [stats, setStats] = useState<TravelStatsPayload>(emptyStats);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await api.getTravelStats({
        from: from || undefined,
        to: to || undefined,
        travelMode: travelMode === "all" ? undefined : travelMode
      });
      setStats(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "统计数据加载失败");
    } finally {
      setIsLoading(false);
    }
  }, [from, to, travelMode]);

  useEffect(() => {
    loadStats();
  }, []);

  const maxMonthlyDistance = useMemo(
    () => Math.max(1, ...stats.monthly.map((item) => item.distanceMeters)),
    [stats.monthly]
  );
  const dailyScaleMeters = useMemo(
    () =>
      chartScaleMeters(
        Math.max(
          0,
          ...stats.daily.flatMap((item) => [item.walkingDistanceMeters, item.vehicleDistanceMeters])
        )
      ),
    [stats.daily]
  );

  return (
    <main className="stats-page">
      <header className="stats-topbar">
        <div className="stats-brand">
          <h1>CityWalk Planner</h1>
          <p>{currentUser.displayName || currentUser.username}</p>
        </div>
        <nav className="view-tabs" aria-label="页面切换">
          <button type="button" onClick={onShowMap}>
            <Map size={16} />
            路线地图
          </button>
          <button type="button" className="active" aria-current="page">
            <BarChart3 size={16} />
            出行统计
          </button>
        </nav>
        <button className="stats-logout icon-button" type="button" title="退出登录" onClick={onLogout}>
          <LogOut size={17} />
        </button>
      </header>

      <section className="stats-content">
        <div className="stats-heading">
          <div>
            <h2>出行统计</h2>
            <p>{isLoading ? "正在加载" : `共 ${stats.summary.tripCount} 条完成记录`}</p>
          </div>
          <form
            className="stats-filters"
            onSubmit={(event) => {
              event.preventDefault();
              loadStats();
            }}
          >
            <label>
              <span>开始日期</span>
              <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              <span>结束日期</span>
              <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
            </label>
            <label>
              <span>出行方式</span>
              <select value={travelMode} onChange={(event) => setTravelMode(event.target.value as TravelMode | "all")}>
                <option value="all">全部</option>
                <option value="walking">步行</option>
                <option value="vehicle">乘车</option>
              </select>
            </label>
            <button className="stats-search-button" type="submit" disabled={isLoading}>
              <Search size={16} />
              查询
            </button>
          </form>
        </div>

        {error ? <div className="stats-error">{error}</div> : null}

        <section className="stats-summary" aria-label="统计总览">
          <div>
            <Route size={19} />
            <span>总距离</span>
            <strong>{formatKilometers(stats.summary.totalDistanceMeters)}</strong>
          </div>
          <div>
            <BarChart3 size={19} />
            <span>出行次数</span>
            <strong>{stats.summary.tripCount}</strong>
          </div>
          <div>
            <Footprints size={19} />
            <span>步行距离</span>
            <strong>{formatKilometers(stats.summary.walkingDistanceMeters)}</strong>
          </div>
          <div>
            <Car size={19} />
            <span>乘车距离</span>
            <strong>{formatKilometers(stats.summary.vehicleDistanceMeters)}</strong>
          </div>
        </section>

        <section className="stats-section daily-stats-section">
          <header>
            <div>
              <h3>每日出行距离（km）</h3>
              <span>{stats.daily.length} 天有出行记录</span>
            </div>
            <div className="daily-chart-legend" aria-label="图例">
              <span className="walking">步行</span>
              <span className="vehicle">乘车</span>
            </div>
          </header>
          {stats.daily.length === 0 ? (
            <div className="stats-empty">当前筛选范围内没有完成记录</div>
          ) : (
            <div className="daily-chart-scroll">
              <div className="daily-chart" style={{ minWidth: Math.max(620, stats.daily.length * 96 + 58) }}>
                <div className="daily-chart-y-axis" aria-hidden="true">
                  <span>{formatChartDistance(dailyScaleMeters)}</span>
                  <span>{formatChartDistance(dailyScaleMeters / 2)}</span>
                  <span>0</span>
                </div>
                <div className="daily-chart-plot">
                  <div className="daily-chart-grid" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="daily-chart-bars">
                    {stats.daily.map((item) => (
                      <div className="daily-chart-group" key={item.date}>
                        <div className="daily-chart-pair">
                          <div
                            className="daily-chart-bar-column"
                            style={{ height: `${(item.walkingDistanceMeters / dailyScaleMeters) * 100}%` }}
                          >
                            {item.walkingDistanceMeters > 0 ? (
                              <span className="daily-chart-value">{formatBarKilometers(item.walkingDistanceMeters)}</span>
                            ) : null}
                            <span
                              className="daily-chart-bar walking"
                              title={`${item.date} 步行 ${formatKilometers(item.walkingDistanceMeters)}`}
                              role="img"
                              aria-label={`${item.date} 步行 ${formatKilometers(item.walkingDistanceMeters)}`}
                            />
                          </div>
                          <div
                            className="daily-chart-bar-column"
                            style={{ height: `${(item.vehicleDistanceMeters / dailyScaleMeters) * 100}%` }}
                          >
                            {item.vehicleDistanceMeters > 0 ? (
                              <span className="daily-chart-value">{formatBarKilometers(item.vehicleDistanceMeters)}</span>
                            ) : null}
                            <span
                              className="daily-chart-bar vehicle"
                              title={`${item.date} 乘车 ${formatKilometers(item.vehicleDistanceMeters)}`}
                              role="img"
                              aria-label={`${item.date} 乘车 ${formatKilometers(item.vehicleDistanceMeters)}`}
                            />
                          </div>
                        </div>
                        <span className="daily-chart-date" title={`${item.date}，${item.tripCount} 次出行`}>
                          {item.date.slice(5).replace("-", "/")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="stats-grid">
          <section className="stats-section">
            <header>
              <h3>月度汇总</h3>
              <span>{stats.monthly.length} 个月</span>
            </header>
            {stats.monthly.length === 0 ? (
              <div className="stats-empty">当前筛选范围内没有完成记录</div>
            ) : (
              <div className="monthly-list">
                {stats.monthly.map((item) => (
                  <div className="monthly-row" key={item.month}>
                    <div className="monthly-row-label">
                      <strong>{item.month}</strong>
                      <span>{item.tripCount} 次</span>
                    </div>
                    <div className="monthly-bar-track">
                      <span style={{ width: `${Math.max(3, (item.distanceMeters / maxMonthlyDistance) * 100)}%` }} />
                    </div>
                    <b>{formatKilometers(item.distanceMeters)}</b>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="stats-section stats-records">
            <header>
              <h3>出行明细</h3>
              <span>{stats.items.length} 条</span>
            </header>
            <div className="stats-table-wrap">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>完成日期</th>
                    <th>路线</th>
                    <th>方式</th>
                    <th>距离</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.items.map((item) => (
                    <tr key={item.routeId}>
                      <td>{item.completedOn}</td>
                      <td>{item.name}</td>
                      <td>
                        <span className={`mode-tag ${item.travelMode}`}>{modeLabel(item.travelMode)}</span>
                      </td>
                      <td>{formatKilometers(item.distanceMeters)}</td>
                    </tr>
                  ))}
                  {!isLoading && stats.items.length === 0 ? (
                    <tr>
                      <td className="stats-table-empty" colSpan={4}>当前筛选范围内没有完成记录</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
