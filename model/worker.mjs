import { forecast } from './forecast.mjs';
self.onmessage = event => {
  const { requestId, data, configurationId, settings } = event.data;
  try { self.postMessage({ requestId, result: forecast(data, configurationId, settings) }); }
  catch (error) { self.postMessage({ requestId, error: error.message }); }
};
