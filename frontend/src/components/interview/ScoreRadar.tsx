'use client';

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';

interface ScoreRadarProps {
  scores: {
    content_completeness: number;
    professionalism: number;
    expression: number;
    star_method: number;
  };
}

const DIMENSION_LABELS: Record<string, string> = {
  content_completeness: '内容完整性',
  professionalism: '专业度',
  expression: '表达能力',
  star_method: 'STAR法则',
};

export default function ScoreRadar({ scores }: ScoreRadarProps) {
  const data = Object.entries(scores).map(([key, value]) => ({
    dimension: DIMENSION_LABELS[key] || key,
    score: value,
    fullMark: 100,
  }));

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="dimension" />
          <PolarRadiusAxis angle={30} domain={[0, 100]} />
          <Radar
            name="评分"
            dataKey="score"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.3}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
