install:
	pip install -e .[dev]
	pre-commit install

test:
	pytest -s

cov:
	pytest --cov=kweb

mypy:
	mypy . --ignore-missing-imports

flake8:
	flake8 --select RST

pylint:
	pylint src/kweb

ruff:
	ruff --fix src/kweb/*.py

doc8:
	doc8 docs/

update-pre:
	pre-commit autoupdate --bleeding-edge

git-rm-merged:
	git branch -D `git branch --merged | grep -v \* | xargs`

release:
	git push
	git push origin --tags

build:
	rm -rf dist
	pip install build
	python -m build
