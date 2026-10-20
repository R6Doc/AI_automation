import Generator from "@/components/Generator";
import { getTeamsBySport } from "@/lib/teams";

export default function Home() {
  return <Generator teamsBySport={getTeamsBySport()} />;
}
