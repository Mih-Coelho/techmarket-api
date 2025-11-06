import http from "k6/http";
import { sleep } from "k6";
export const options = { vus: 60, duration: "3m" };
export default function () {
  http.get("https://techmarket-api-container.braveforest-a222ef2c.brazilsouth.azurecontainerapps.io/hot");
  sleep(0.1);
}
