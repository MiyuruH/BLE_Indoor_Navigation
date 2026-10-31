CXX      ?= g++
CXXFLAGS ?= -O2 -std=c++17 -Wall -Wextra

all: sim/new_bot sim/old_bot

sim/new_bot: src/solution.cpp
	$(CXX) $(CXXFLAGS) -o $@ $<

sim/old_bot: src/old_bot.cpp
	$(CXX) -O2 -std=c++17 -o $@ $<

test: all
	python3 sim/suite.py sim/new_bot --seeds 6

report: all
	python3 sim/report.py 8

clean:
	rm -f sim/new_bot sim/old_bot
