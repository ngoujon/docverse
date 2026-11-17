import DashboardPage from "../src/pages/app/DashboardPage";
import { clientOnlyPage } from "../src/pageKinds";

export default clientOnlyPage(DashboardPage, "user");
