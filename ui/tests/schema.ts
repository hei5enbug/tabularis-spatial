import { Ajv } from "../../../tabularis-host/packages/service-contracts/node_modules/ajv/dist/ajv.js";
import requestSchema from "../../../tabularis-host/packages/service-contracts/schema/v1/request.json";
import responseSchema from "../../../tabularis-host/packages/service-contracts/schema/v1/response.json";
const ajv = new Ajv({ strict: false, allErrors: true });
const request = ajv.compile(requestSchema as object);
const response = ajv.compile(responseSchema as object);
export const validateRequest = (value: unknown) => ({ valid: Boolean(request(value)), errors: request.errors });
export const validateResponse = (value: unknown) => ({ valid: Boolean(response(value)), errors: response.errors });
