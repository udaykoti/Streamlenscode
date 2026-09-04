package com.streamlens.service.benchmark;

import com.streamlens.model.BenchmarkResult;
import com.streamlens.service.engine.SemanticEquivalenceEngine;
import com.streamlens.service.ir.StreamPipeline;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

@Service
public class BenchmarkEngine {

    private final SemanticEquivalenceEngine equivalenceEngine;

    public BenchmarkEngine(SemanticEquivalenceEngine equivalenceEngine) {
        this.equivalenceEngine = equivalenceEngine;
    }

    public BenchmarkResult benchmark(StreamPipeline original, StreamPipeline alternative, int iterations) {
        BenchmarkResult result = new BenchmarkResult();
        result.setIterations(iterations);

        List<List<Integer>> datasets = generateTestDatasets();

        long origTotal = 0;
        long altTotal = 0;
        int origElements = 0;
        int altElements = 0;

        for (List<Integer> dataset : datasets) {
            for (int i = 0; i < iterations / datasets.size(); i++) {
                long start = System.nanoTime();
                List<Integer> origOutput = equivalenceEngine.executePipeline(original, dataset);
                long origTime = System.nanoTime() - start;
                origTotal += origTime;
                origElements += origOutput.size();

                start = System.nanoTime();
                List<Integer> altOutput = equivalenceEngine.executePipeline(alternative, dataset);
                long altTime = System.nanoTime() - start;
                altTotal += altTime;
                altElements += altOutput.size();
            }
        }

        int effectiveIterations = Math.max(1, iterations);
        long origAvg = origTotal / effectiveIterations;
        long altAvg = altTotal / effectiveIterations;

        result.setOriginalTimeNanos(origAvg);
        result.setAlternativeTimeNanos(altAvg);
        result.setOriginalAvgFormatted(formatNanos(origAvg));
        result.setAlternativeAvgFormatted(formatNanos(altAvg));
        result.setOriginalElementCount(origElements / effectiveIterations);
        result.setAlternativeElementCount(altElements / effectiveIterations);

        if (origAvg > 0) {
            result.setSpeedupRatio((double) altAvg / origAvg);
        } else {
            result.setSpeedupRatio(1.0);
        }

        return result;
    }

    private List<List<Integer>> generateTestDatasets() {
        List<List<Integer>> datasets = new ArrayList<>();

        datasets.add(generateRandom(100));
        datasets.add(generateSequential(1000));
        datasets.add(generateRandom(1000));
        datasets.add(generateSequential(10000));
        datasets.add(generateWithDuplicates(500));
        datasets.add(generateAllNegative(200));
        datasets.add(generateMixed(500));

        return datasets;
    }

    private List<Integer> generateRandom(int size) {
        List<Integer> list = new ArrayList<>();
        Random rng = ThreadLocalRandom.current();
        for (int i = 0; i < size; i++) {
            list.add(rng.nextInt(-1000, 1001));
        }
        return list;
    }

    private List<Integer> generateSequential(int size) {
        List<Integer> list = new ArrayList<>();
        for (int i = 1; i <= size; i++) {
            list.add(i);
        }
        return list;
    }

    private List<Integer> generateWithDuplicates(int size) {
        List<Integer> list = new ArrayList<>();
        Random rng = ThreadLocalRandom.current();
        for (int i = 0; i < size; i++) {
            list.add(rng.nextInt(1, 51));
        }
        return list;
    }

    private List<Integer> generateAllNegative(int size) {
        List<Integer> list = new ArrayList<>();
        Random rng = ThreadLocalRandom.current();
        for (int i = 0; i < size; i++) {
            list.add(rng.nextInt(-100, 0));
        }
        return list;
    }

    private List<Integer> generateMixed(int size) {
        List<Integer> list = new ArrayList<>();
        Random rng = ThreadLocalRandom.current();
        for (int i = 0; i < size; i++) {
            list.add(rng.nextInt(-500, 501));
        }
        return list;
    }

    private String formatNanos(long nanos) {
        if (nanos < 1_000) {
            return nanos + " ns";
        } else if (nanos < 1_000_000) {
            return String.format("%.2f us", nanos / 1000.0);
        } else if (nanos < 1_000_000_000) {
            return String.format("%.2f ms", nanos / 1_000_000.0);
        } else {
            return String.format("%.2f s", nanos / 1_000_000_000.0);
        }
    }
}
