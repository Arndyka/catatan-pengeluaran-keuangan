// Compatibility guard for older imports. Remote LLM features are retired.
const disabled=async()=>{throw new Error('LLM dinonaktifkan. Gunakan pembaca PDF dan OCR lokal.');};
export const checkNvidiaBackend=disabled;
export const readPageWithNvidia=disabled;
export const optimizeCandidatesWithNvidia=disabled;
