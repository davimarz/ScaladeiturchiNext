import PublicHeader from "../../components/PublicHeader";
import PublicTabs from "../../components/PublicTabs";
import { Favorites } from "../../components/SavedProducts";
export default function Page() { return <main><PublicHeader /><PublicTabs active="home"/><div className="compactCatalogPage"><Favorites /></div></main>; }
