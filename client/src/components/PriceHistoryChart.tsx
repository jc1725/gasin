import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const won = (value: number) => `${new Intl.NumberFormat("ko-KR").format(value)}원`;

type PriceHistoryPoint = {
  date: string;
  price: number;
};

type PriceHistoryChartProps = {
  data: PriceHistoryPoint[];
};

export default function PriceHistoryChart({ data }: PriceHistoryChartProps) {
  return (
    <div className="h-55" aria-label="가격 이력 차트">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, left: -20, right: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="priceHistory" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#31a866" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#31a866" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#e9efea" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#8b988d", fontSize: 10 }} minTickGap={28} />
          <YAxis tickFormatter={value => `${Math.round(value / 1000)}천`} tickLine={false} axisLine={false} tick={{ fill: "#8b988d", fontSize: 10 }} width={38} />
          <Tooltip formatter={(value: number) => [won(value), "가격"]} contentStyle={{ borderRadius: 12, borderColor: "#dfe9e0", fontSize: 12 }} />
          <Area type="monotone" dataKey="price" stroke="#198b4a" strokeWidth={2.5} fill="url(#priceHistory)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
