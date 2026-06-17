# Chatbot evaluation

## 1. Script to activate the evaluate of RAG

```bash
.conda/bin/python orchestrator-ai/eval/run_answer_correctness_eval.py \
  --rag-dataset rag-ai/evals/output/course21_eval_langsmith.jsonl \
  --a2a-endpoint http://localhost:3007/ \
  --limit 50 \
  --model gpt-4.1-mini \
  --tenant-id course_21 \
  --output-dir orchestrator-ai/eval/output
```
- Parameters
    - `--rag-dataset`: The directory to the dataset.
    - `--a2a-endpoint`: The endpoint of the Orchestrator AI.
    - `--limit 50`: Number of test.
    - `--model`: Judge model.
    - `--tenant-id`: The tenant use for bypass multi-tenant of Qdrant database.
    - `--output-dir`: The directory to store the final test result.