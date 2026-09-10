import { app } from "./app.js";
import { env } from "./config.js";

app.listen(env.API_PORT, () => {
  console.log(`PosFlow API listening on port ${env.API_PORT}`);
});

