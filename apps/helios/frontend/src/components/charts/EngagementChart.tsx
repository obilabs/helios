import React from 'react';
import './EngagementChart.css';

interface DailyData {
  date: string;
  opens: number;
  unique: number;
}

interface EngagementChartProps {
  data: DailyData[];
  height?: number;
  showUnique?: boolean;
  className?: string;
}

export const EngagementChart: React.FC<EngagementChartProps> = ({
  data,
  height = 200,
  showUnique = true,
  className = '',
}) => {
  if (!data || data.length === 0) {
    return (
      <div className={`engagement-chart ${className}`} style={{ height }}>
        <div className="chart-empty-state">No engagement data available</div>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => Math.max(d.opens, d.unique || 0)), 1);

  // Calculate Y-axis labels
  const yLabels = [];
  const step = Math.ceil(maxValue / 4);
  for (let i = 0; i <= 4; i++) {
    yLabels.push(step * i);
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDateShort = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short' }).substring(0, 2);
  };

  return (
    <div className={`engagement-chart ${className}`}>
      {/* Legend */}
      <div className="chart-legend">
        <div className="legend-item">
          <span className="legend-dot opens"></span>
          <span className="legend-label">Total Opens</span>
        </div>
        {showUnique && (
          <div className="legend-item">
            <span className="legend-dot unique"></span>
            <span className="legend-label">Unique Opens</span>
          </div>
        )}
      </div>

      <div className="chart-container" style={{ height }}>
        {/* Y-axis labels */}
        <div className="y-axis">
          {yLabels.reverse().map((label, i) => (
            <span key={i} className="y-label">{label}</span>
          ))}
        </div>

        {/* Chart area */}
        <div className="chart-area">
          {/* Grid lines */}
          <div className="chart-grid">
            {yLabels.map((_, i) => (
              <div key={i} className="grid-line"></div>
            ))}
          </div>

          {/* Bars */}
          <div className="chart-bars">
            {data.map((item, index) => {
              const opensHeight = (item.opens / maxValue) * 100;
              const uniqueHeight = showUnique ? (item.unique / maxValue) * 100 : 0;

              return (
                <div key={index} className="bar-group">
                  <div className="bars-container">
                    <div
                      className="bar bar-opens"
                      style={{ height: `${opensHeight}%` }}
                      title={`${item.opens} opens on ${formatDate(item.date)}`}
                    >
                      {item.opens > 0 && opensHeight > 15 && (
                        <span className="bar-value">{item.opens}</span>
                      )}
                    </div>
                    {showUnique && (
                      <div
                        className="bar bar-unique"
                        style={{ height: `${uniqueHeight}%` }}
                        title={`${item.unique} unique opens on ${formatDate(item.date)}`}
                      >
                        {item.unique > 0 && uniqueHeight > 15 && (
                          <span className="bar-value">{item.unique}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="bar-label">{formatDateShort(item.date)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EngagementChart;
