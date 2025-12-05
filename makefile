PRD=./docs/run-multi-attempt-design.md
STEPS="run\ 命令多轮自动修复与验证需求实现步骤"

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

run_run_no_test:
	npm run dev -- run "${STEPS}" --no-test

install_nodes:
	npm install

install: install_nodes
	npm link

uninstall:
	npm unlink agent-foreman
