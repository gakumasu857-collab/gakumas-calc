import { useScenario } from "@/lib/useScenario";
import HatsuSchedulePage from "./HatsuSchedulePage";
import NiaSchedulePage from "./NiaSchedulePage";
import SchedulePage from "./SchedulePage";

/**
 * ホームで選んだ育成シナリオに応じてレッスンページを切り替える。
 * ※ useStoreVersion で再マウントするとページ内の編集のたびにスクロールが
 *   リセットされるため使わない（シナリオの変更はホームでしか起きない）。
 */
export default function ScenarioSchedulePage() {
  const { scenario, loaded } = useScenario();
  if (!loaded) return null;
  if (scenario === "niaMaster") return <NiaSchedulePage />;
  if (scenario === "hatsuLegend") return <HatsuSchedulePage />;
  return <SchedulePage />;
}
