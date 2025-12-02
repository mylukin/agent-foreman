PRD=./docs/run-multi-attempt-design.md
STEPS=实现步骤执行与进度跟踪需求实现步骤

run_analyze:
	npm run dev -- analyze $(PRD)

run_run:
	npm run dev -- run "${STEPS}"

run_run_verify:
	npm run dev -- run "${STEPS}" --full-verify

run_run_verify_only:
	npm run dev -- run "${STEPS}" --verify-only

run_run_verify_unittest_only:
	npm run dev -- run "${STEPS}" --verify-unittest-only

run_run_verify_generate_unittest:
	npm run dev -- run "${STEPS}" --verify-generate-unittest
