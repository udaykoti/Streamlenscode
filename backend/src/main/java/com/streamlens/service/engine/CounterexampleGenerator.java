package com.streamlens.service.engine;

import com.streamlens.model.Counterexample;
import com.streamlens.service.ir.StreamPipeline;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class CounterexampleGenerator {

    private final SemanticEquivalenceEngine equivalenceEngine;

    public CounterexampleGenerator(SemanticEquivalenceEngine equivalenceEngine) {
        this.equivalenceEngine = equivalenceEngine;
    }

    public Counterexample generate(StreamPipeline original, StreamPipeline alternative) {
        Counterexample ce = new Counterexample();

        List<List<Integer>> testCases = List.of(
            List.of(6),
            List.of(1, 2, 3, 4, 5),
            List.of(10, 20, 30, 40, 50),
            List.of(1, 1, 2, 2, 3, 3),
            List.of(-5, -1, 0, 1, 5),
            List.of(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
            List.of(100, 50, 25, 10, 5, 1),
            List.of(3, 7, 11, 15, 19),
            List.of(2, 4, 6, 8, 10, 12, 14, 16, 18, 20),
            List.of(1, 3, 5, 7, 9, 11, 13, 15),
            generateSmallSequential(),
            generateEdgeCases()
        );

        for (List<Integer> input : testCases) {
            List<Integer> origOutput = equivalenceEngine.executePipeline(original, input);
            List<Integer> altOutput = equivalenceEngine.executePipeline(alternative, input);

            if (!origOutput.equals(altOutput)) {
                ce.setInput(input);
                ce.setOriginalOutput(origOutput);
                ce.setAlternativeOutput(altOutput);
                ce.setExplanation(generateExplanation(input, origOutput, altOutput, original, alternative));
                return ce;
            }
        }

        ce.setInput(List.of());
        ce.setOriginalOutput(List.of());
        ce.setAlternativeOutput(List.of());
        ce.setExplanation("No counterexample found with tested inputs. Transformation may be safe or require more extensive testing.");
        return ce;
    }

    private String generateExplanation(
        List<Integer> input,
        List<Integer> origOutput,
        List<Integer> altOutput,
        StreamPipeline original,
        StreamPipeline alternative
    ) {
        StringBuilder sb = new StringBuilder();
        sb.append("Input: ").append(input).append("\n\n");

        sb.append("Original pipeline output: ").append(origOutput).append("\n");
        sb.append("Alternative pipeline output: ").append(altOutput).append("\n\n");

        if (origOutput.size() != altOutput.size()) {
            sb.append("Reason: The transformations produce different numbers of elements.\n");
            sb.append("Original has ").append(origOutput.size()).append(" elements, ");
            sb.append("alternative has ").append(altOutput.size()).append(" elements.");
        } else {
            for (int i = 0; i < Math.min(origOutput.size(), altOutput.size()); i++) {
                if (!Objects.equals(origOutput.get(i), altOutput.get(i))) {
                    sb.append("Reason: At position ").append(i).append(", ");
                    sb.append("original produced ").append(origOutput.get(i)).append(", ");
                    sb.append("alternative produced ").append(altOutput.get(i)).append(".\n");
                    sb.append("The operation reordering changed how the value was transformed/filtered.");
                    break;
                }
            }
        }

        return sb.toString();
    }

    private List<Integer> generateSmallSequential() {
        return List.of(1, 2, 3, 4, 5, 6);
    }

    private List<Integer> generateEdgeCases() {
        return List.of(Integer.MAX_VALUE, 0, -1, 1, Integer.MIN_VALUE);
    }
}
