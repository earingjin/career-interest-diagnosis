import { RIASEC_ORDER, type RiasecType } from "@/content/types";
import type { ResultTotalRow } from "@/lib/result/view";

const CENTER = 150;
const RADIUS = 100;
const MAX_SCORE = 12;
const GRID_SCORES = [3, 6, 9, 12];

// 축 순서와 각도(도): R 위쪽에서 시작해 시계 방향
const ANGLE: Record<RiasecType, number> = { R: -90, I: -30, A: 30, S: 90, E: 150, C: 210 };

function point(type: RiasecType, radius: number): [number, number] {
  const rad = (ANGLE[type] * Math.PI) / 180;
  return [CENTER + radius * Math.cos(rad), CENTER + radius * Math.sin(rad)];
}

const fmt = (n: number) => Math.round(n * 100) / 100;
const toPoints = (points: [number, number][]) => points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(" ");

/** 라벨 두 줄("유형코드 유형명", "점수점")의 위치. 꼭짓점 바깥쪽에 둔다. */
function labelPlacement(type: RiasecType): { x: number; y: number; anchor: "start" | "middle" | "end" } {
  const [vx, vy] = point(type, RADIUS);
  switch (type) {
    case "R":
      return { x: vx, y: vy - 27, anchor: "middle" };
    case "S":
      return { x: vx, y: vy + 22, anchor: "middle" };
    case "I":
    case "A":
      return { x: vx + 8, y: vy - 2, anchor: "start" };
    default: // E, C
      return { x: vx - 8, y: vy - 2, anchor: "end" };
  }
}

type Props = {
  totals: ResultTotalRow[];
  className?: string;
  /** false 면 꼭짓점 라벨에서 점수 숫자만 뺀다. A4 결과지가 점수를 표로 따로 보여줄 때 쓴다. */
  showScores?: boolean;
};

export function ResultHexagon({ totals, className, showScores = true }: Props) {
  const byType = new Map(totals.map((row) => [row.type, row]));
  const description = RIASEC_ORDER.map((t) => {
    const row = byType.get(t);
    return row ? `${row.nameKo} ${row.total}점` : "";
  }).join(", ");

  const dataPoints = RIASEC_ORDER.map((type) => {
    const total = Math.min(MAX_SCORE, Math.max(0, byType.get(type)?.total ?? 0));
    return point(type, (RADIUS * total) / MAX_SCORE);
  });

  return (
    <svg
      className={className}
      viewBox={showScores ? "0 0 300 300" : "0 8 300 276"} // 점수 줄이 없으면 위아래 여백만 줄인다. 눈금·다각형 크기는 같다.
      role="img"
      aria-label={`유형별 점수 그래프: ${description}`}
      style={{ width: "100%", maxWidth: 340, height: "auto", overflow: "visible" }}
    >
      {/* 눈금 3, 6, 9, 12 의 육각형 격자 */}
      {GRID_SCORES.map((score) => (
        <polygon
          key={score}
          points={toPoints(RIASEC_ORDER.map((type) => point(type, (RADIUS * score) / MAX_SCORE)))}
          fill="none"
          stroke="#c8c8cc"
          strokeWidth={1}
        />
      ))}
      {/* 중심에서 나가는 축 */}
      {RIASEC_ORDER.map((type) => {
        const [x, y] = point(type, RADIUS);
        return <line key={type} x1={CENTER} y1={CENTER} x2={fmt(x)} y2={fmt(y)} stroke="#c8c8cc" strokeWidth={1} />;
      })}

      {/* 데이터 다각형 */}
      <polygon
        points={toPoints(dataPoints)}
        strokeWidth={2}
        strokeLinejoin="round"
        style={{ fill: "var(--bg-accent)", fillOpacity: 0.7, stroke: "var(--border-accent)" }}
      />

      {/* 꼭짓점: 1·2순위는 크고 진하게 */}
      {RIASEC_ORDER.map((type, index) => {
        const emphasized = byType.get(type)?.emphasized === true;
        const [x, y] = dataPoints[index];
        return emphasized ? (
          <circle key={type} cx={fmt(x)} cy={fmt(y)} r={6} style={{ fill: "var(--border-accent)" }} />
        ) : (
          <circle key={type} cx={fmt(x)} cy={fmt(y)} r={4} fill="#b4b4ba" />
        );
      })}

      {/* 라벨 */}
      {RIASEC_ORDER.map((type) => {
        const row = byType.get(type);
        if (!row) return null;
        const { x, y, anchor } = labelPlacement(type);
        const emphasized = row.emphasized;
        return (
          <text
            key={type}
            x={fmt(x)}
            y={fmt(y)}
            textAnchor={anchor}
            fontSize={15}
            fontWeight={emphasized ? 800 : 400}
            style={{ fill: emphasized ? "var(--border-accent)" : "#555555" }}
          >
            <tspan x={fmt(x)}>
              {type} {row.nameKo}
            </tspan>
            {showScores && (
              <tspan x={fmt(x)} dy={17}>
                {row.total}점
              </tspan>
            )}
          </text>
        );
      })}
    </svg>
  );
}
