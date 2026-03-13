import { useEffect, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { colors } from "@design";
import { useTranslation } from "react-i18next";

interface SimpleChartProps {
  data: { timestamp: number; value: number }[];
  height?: number;
  color?: string;
}

const createSmoothPath = (points: { x: number; y: number }[]): string => {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

  let path = `M ${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];

    const xMid = (current.x + next.x) / 2;
    const yMid = (current.y + next.y) / 2;

    path += ` Q ${current.x},${current.y} ${xMid},${yMid}`;
  }

  const last = points.at(-1)!;
  path += ` L ${last.x},${last.y}`;

  return path;
};

export const SimpleLineChart = ({
  data,
  height = 200,
  color = colors.secondary,
}: SimpleChartProps) => {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const prevDataLengthRef = useRef(data.length);

  useEffect(() => {
    if (svgRef.current && data.length > prevDataLengthRef.current) {
      const svg = svgRef.current;
      const scrollAmount = (1 / Math.max(data.length - 1, 1)) * 100;

      svg.style.transform = `translateX(-${scrollAmount}%)`;

      setTimeout(() => {
        svg.style.transition = "none";
        svg.style.transform = "translateX(0)";
        setTimeout(() => {
          if (svg) {
            svg.style.transition = "transform 1s linear";
          }
        }, 10);
      }, 1000);
    }
    prevDataLengthRef.current = data.length;
  }, [data]);

  if (data.length === 0)
    return (
      <Typography sx={{ color: colors.text.secondary }}>{t("core.noData")}</Typography>
    );

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const minValue = Math.min(...data.map((d) => d.value), 0);
  const range = maxValue - minValue || 1;

  const padding = height * 0.1;
  const chartHeight = height - padding * 2;

  const width = 100;
  const points = data.map((d, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * width,
    y: padding + chartHeight - ((d.value - minValue) / range) * chartHeight,
  }));

  const smoothPath = createSmoothPath(points);
  const areaPath = `${smoothPath} L ${width},${height} L 0,${height} Z`;
  const gradientId = `gradient-${Math.random().toString(36).substring(2, 11)}`;

  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        height,
        pl: 1,
        overflow: "hidden",
      }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{
          overflow: "visible",
          transition: "transform 1s linear",
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.1" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y * height}
            x2={width}
            y2={y * height}
            stroke={colors.border.light}
            strokeWidth="1"
            strokeDasharray="1"
            opacity=".4"
          />
        ))}

        <path
          d={areaPath}
          fill={`url(#${gradientId})`}
          style={{
            transition: "d 0.3s ease-in-out",
          }}
        />

        <path
          d={smoothPath}
          fill="none"
          stroke={color}
          strokeWidth=".2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transition: "d 0.3s ease-in-out",
          }}
        />
      </svg>

      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          pr: 1,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: colors.text.secondary,
            fontSize: "0.7rem",
            lineHeight: 1,
          }}
        >
          {maxValue.toFixed(1)}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: colors.text.secondary,
            fontSize: "0.7rem",
            lineHeight: 1,
          }}
        >
          {(minValue + range / 2).toFixed(1)}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: colors.text.secondary,
            fontSize: "0.7rem",
            lineHeight: 1,
          }}
        >
          {minValue.toFixed(1)}
        </Typography>
      </Box>
    </Box>
  );
};
