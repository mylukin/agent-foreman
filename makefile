run_analyze:
	npm run dev -- analyze ./docs/run-command-requirements.md

run_run:
	npm run dev -- run "实现步骤执行与进度跟踪需求实现步骤"

run_run_verify:
	npm run dev -- run "实现步骤执行与进度跟踪需求实现步骤" --full-verify

run_run_verify_only:
	npm run dev -- run "实现步骤执行与进度跟踪需求实现步骤" --verify-only

run_run_verify_unittest_only:
	npm run dev -- run "实现步骤执行与进度跟踪需求实现步骤" --verify-unittest-only

run_run_verify_generate_unittest:
	npm run dev -- run "实现步骤执行与进度跟踪需求实现步骤" --verify-generate-unittest
