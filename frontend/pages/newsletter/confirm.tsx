import NewsletterConfirmPage from "../../src/pages/auth/NewsletterConfirmPage";
import { clientOnlyPage } from "../../src/pageKinds";

export default clientOnlyPage(() => <NewsletterConfirmPage mode="confirm" />);
