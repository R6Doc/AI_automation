import Generator from "@/components/Generator";
import { getTeams } from "@/lib/teams";

export default function Home() {
  return <Generator teams={getTeams()} />;
}
