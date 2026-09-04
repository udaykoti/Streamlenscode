package com.streamlens.service.engine;

import com.streamlens.service.ir.OperationType;
import com.streamlens.service.ir.StreamOperation;
import com.streamlens.service.ir.StreamPipeline;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.function.Predicate;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class SemanticEquivalenceEngine {

    public record EquivalenceResult(
        String classification,
        String reason,
        boolean requiresDynamicCheck
    ) {}

    public EquivalenceResult analyzeStatic(StreamPipeline original, StreamPipeline alternative) {
        List<StreamOperation> origOps = original.getIntermediateOperations();
        List<StreamOperation> altOps = alternative.getIntermediateOperations();

        if (origOps.equals(altOps)) {
            return new EquivalenceResult("SAFE", "Pipelines are identical", false);
        }

        if (hasSideEffectingOperations(origOps) || hasSideEffectingOperations(altOps)) {
            return new EquivalenceResult("UNSAFE",
                "Both pipelines contain side-effecting operations (peek). " +
                "Reordering side effects changes program behavior.", false);
        }

        if (hasTerminalShortCircuit(original.getTerminalOperation())) {
            return new EquivalenceResult("UNSAFE",
                "Terminal operation " + original.getTerminalOperation().getType().getMethodName() +
                "() is order-dependent. Reordering intermediate operations affects the result.", false);
        }

        Set<OperationType> origTypes = operationTypes(origOps);
        Set<OperationType> altTypes = operationTypes(altOps);

        if (!origTypes.equals(altTypes)) {
            return new EquivalenceResult("UNSAFE",
                "Operation sets differ: " + origTypes + " vs " + altTypes, false);
        }

        if (onlyFilterAndMap(origOps) && onlyFilterAndMap(altOps)) {
            if (hasFilterBeforeMap(origOps) && hasMapBeforeFilter(altOps)) {
                return new EquivalenceResult("CONDITIONALLY SAFE",
                    "Reordering filter and map is only safe when the map operation does not " +
                    "produce values that would change the filter predicate outcome.", true);
            }
            if (hasMapBeforeFilter(origOps) && hasFilterBeforeMap(altOps)) {
                return new EquivalenceResult("CONDITIONALLY SAFE",
                    "Reordering map and filter is only safe when the filter predicate " +
                    "does not depend on the mapped value.", true);
            }
        }

        if (origOps.size() == altOps.size()) {
            boolean sameOps = true;
            for (int i = 0; i < origOps.size(); i++) {
                if (origOps.get(i).getType() != altOps.get(i).getType()) {
                    sameOps = false;
                    break;
                }
            }
            if (sameOps) {
                boolean sameLambdas = true;
                for (int i = 0; i < origOps.size(); i++) {
                    if (!Objects.equals(origOps.get(i).getLambdaExpression(),
                                        altOps.get(i).getLambdaExpression())) {
                        sameLambdas = false;
                        break;
                    }
                }
                if (sameLambdas) {
                    return new EquivalenceResult("SAFE", "Same operations in same order with same predicates", false);
                }
            }
        }

        boolean hasStateful = origOps.stream().anyMatch(StreamOperation::isStateful) ||
                              altOps.stream().anyMatch(StreamOperation::isStateful);
        if (hasStateful) {
            return new EquivalenceResult("UNKNOWN",
                "Stateful operations (sorted, distinct, limit, skip) detected. " +
                "Static analysis cannot determine equivalence. Runtime verification required.", true);
        }

        return new EquivalenceResult("UNKNOWN",
            "Static analysis is insufficient to determine equivalence. " +
            "Dynamic verification with test inputs is required.", true);
    }

    public Map<String, Object> analyzeDynamic(StreamPipeline original, StreamPipeline alternative, List<Integer> testInput) {
        Map<String, Object> result = new LinkedHashMap<>();

        List<Integer> origOutput = executePipeline(original, testInput);
        List<Integer> altOutput = executePipeline(alternative, testInput);

        result.put("testInput", testInput);
        result.put("originalOutput", origOutput);
        result.put("alternativeOutput", altOutput);

        boolean valuesMatch = origOutput.equals(altOutput);
        result.put("valuesMatch", valuesMatch);

        result.put("countMatch", origOutput.size() == altOutput.size());

        result.put("classification", valuesMatch ? "SAFE" : "UNSAFE");

        if (!valuesMatch) {
            result.put("reason", "Output values differ for input " + testInput +
                ". Original: " + origOutput + ", Alternative: " + altOutput);
        } else {
            result.put("reason", "Outputs match for test input " + testInput);
        }

        return result;
    }

    public List<Integer> executePipeline(StreamPipeline pipeline, List<Integer> input) {
        List<Integer> result = new ArrayList<>(input);

        for (StreamOperation op : pipeline.getIntermediateOperations()) {
            result = applyOperation(op, result);
        }

        if (pipeline.getTerminalOperation() != null) {
            result = applyTerminal(pipeline.getTerminalOperation(), result);
        }

        return result;
    }

    private List<Integer> applyOperation(StreamOperation op, List<Integer> input) {
        return switch (op.getType()) {
            case FILTER -> {
                Predicate<Integer> predicate = parseFilterPredicate(op.getLambdaExpression());
                yield input.stream().filter(predicate).toList();
            }
            case MAP -> {
                Function<Integer, Integer> mapper = parseMapFunction(op.getLambdaExpression());
                yield input.stream().map(mapper).toList();
            }
            case SORTED -> input.stream().sorted().toList();
            case DISTINCT -> input.stream().distinct().toList();
            case LIMIT -> {
                int limit = parseLimitArg(op.getArgumentExpression());
                yield input.stream().limit(limit).toList();
            }
            case SKIP -> {
                int skip = parseSkipArg(op.getArgumentExpression());
                yield input.stream().skip(skip).toList();
            }
            case FLATMAP -> {
                Function<Integer, List<Integer>> mapper = parseFlatMapFunction(op.getLambdaExpression());
                yield input.stream().flatMap(x -> mapper.apply(x).stream()).toList();
            }
            case PEEK -> input;
            default -> input;
        };
    }

    private List<Integer> applyTerminal(StreamOperation op, List<Integer> input) {
        return switch (op.getType()) {
            case TO_LIST -> input;
            case TO_SET -> new ArrayList<>(new LinkedHashSet<>(input));
            case COUNT -> List.of(input.size());
            case FIND_FIRST -> input.isEmpty() ? List.of() : List.of(input.get(0));
            case FIND_ANY -> input.isEmpty() ? List.of() : List.of(input.get(input.size() / 2));
            case REDUCE -> {
                if (input.isEmpty()) yield List.of();
                int sum = 0;
                for (int v : input) sum += v;
                yield List.of(sum);
            }
            default -> input;
        };
    }

    private Predicate<Integer> parseFilterPredicate(String lambda) {
        if (lambda == null) return x -> true;

        Pattern gtPattern = Pattern.compile("(\\w+)\\s*>\\s*(-?\\d+)");
        Matcher gtMatcher = gtPattern.matcher(lambda);
        if (gtMatcher.find()) {
            int threshold = Integer.parseInt(gtMatcher.group(2));
            return x -> x > threshold;
        }

        Pattern ltPattern = Pattern.compile("(\\w+)\\s*<\\s*(-?\\d+)");
        Matcher ltMatcher = ltPattern.matcher(lambda);
        if (ltMatcher.find()) {
            int threshold = Integer.parseInt(ltMatcher.group(2));
            return x -> x < threshold;
        }

        Pattern gePattern = Pattern.compile("(\\w+)\\s*>=\\s*(-?\\d+)");
        Matcher geMatcher = gePattern.matcher(lambda);
        if (geMatcher.find()) {
            int threshold = Integer.parseInt(geMatcher.group(2));
            return x -> x >= threshold;
        }

        Pattern lePattern = Pattern.compile("(\\w+)\\s*<=\\s*(-?\\d+)");
        Matcher leMatcher = lePattern.matcher(lambda);
        if (leMatcher.find()) {
            int threshold = Integer.parseInt(leMatcher.group(2));
            return x -> x <= threshold;
        }

        Pattern eqPattern = Pattern.compile("(\\w+)\\s*==\\s*(-?\\d+)");
        Matcher eqMatcher = eqPattern.matcher(lambda);
        if (eqMatcher.find()) {
            int value = Integer.parseInt(eqMatcher.group(2));
            return x -> x == value;
        }

        Pattern neqPattern = Pattern.compile("(\\w+)\\s*!=\\s*(-?\\d+)");
        Matcher neqMatcher = neqPattern.matcher(lambda);
        if (neqMatcher.find()) {
            int value = Integer.parseInt(neqMatcher.group(2));
            return x -> x != value;
        }

        Pattern evenPattern = Pattern.compile("(\\w+)\\s*%\\s*2\\s*==\\s*0");
        Matcher evenMatcher = evenPattern.matcher(lambda);
        if (evenMatcher.find()) {
            return x -> x % 2 == 0;
        }

        Pattern oddPattern = Pattern.compile("(\\w+)\\s*%\\s*2\\s*!=\\s*0");
        Matcher oddMatcher = oddPattern.matcher(lambda);
        if (oddMatcher.find()) {
            return x -> x % 2 != 0;
        }

        return x -> true;
    }

    private Function<Integer, Integer> parseMapFunction(String lambda) {
        if (lambda == null) return x -> x;

        Pattern multPattern = Pattern.compile("(\\w+)\\s*\\*\\s*(-?\\d+)");
        Matcher multMatcher = multPattern.matcher(lambda);
        if (multMatcher.find()) {
            int factor = Integer.parseInt(multMatcher.group(2));
            return x -> x * factor;
        }

        Pattern addPattern = Pattern.compile("(\\w+)\\s*\\+\\s*(-?\\d+)");
        Matcher addMatcher = addPattern.matcher(lambda);
        if (addMatcher.find()) {
            int addend = Integer.parseInt(addMatcher.group(2));
            return x -> x + addend;
        }

        Pattern subPattern = Pattern.compile("(\\w+)\\s*-\\s*(-?\\d+)");
        Matcher subMatcher = subPattern.matcher(lambda);
        if (subMatcher.find()) {
            int subtrahend = Integer.parseInt(subMatcher.group(2));
            return x -> x - subtrahend;
        }

        Pattern divPattern = Pattern.compile("(\\w+)\\s*/\\s*(-?\\d+)");
        Matcher divMatcher = divPattern.matcher(lambda);
        if (divMatcher.find()) {
            int divisor = Integer.parseInt(divMatcher.group(2));
            return x -> divisor != 0 ? x / divisor : x;
        }

        Pattern squarePattern = Pattern.compile("(\\w+)\\s*\\*\\s*\\1");
        Matcher squareMatcher = squarePattern.matcher(lambda);
        if (squareMatcher.find()) {
            return x -> x * x;
        }

        Pattern negatePattern = Pattern.compile("-\\s*(\\w+)");
        Matcher negateMatcher = negatePattern.matcher(lambda);
        if (negateMatcher.find()) {
            return x -> -x;
        }

        Pattern absPattern = Pattern.compile("Math\\.abs\\((\\w+)\\)");
        Matcher absMatcher = absPattern.matcher(lambda);
        if (absMatcher.find()) {
            return x -> Math.abs(x);
        }

        return x -> x;
    }

    private Function<Integer, List<Integer>> parseFlatMapFunction(String lambda) {
        if (lambda == null) return x -> List.of(x);

        if (lambda.contains("List.of") || lambda.contains("Arrays.asList")) {
            return x -> List.of(x, x * 2);
        }

        return x -> List.of(x);
    }

    private int parseLimitArg(String arg) {
        if (arg == null) return 10;
        Pattern p = Pattern.compile("(\\d+)");
        Matcher m = p.matcher(arg);
        if (m.find()) {
            return Integer.parseInt(m.group(1));
        }
        return 10;
    }

    private int parseSkipArg(String arg) {
        if (arg == null) return 1;
        Pattern p = Pattern.compile("(\\d+)");
        Matcher m = p.matcher(arg);
        if (m.find()) {
            return Integer.parseInt(m.group(1));
        }
        return 1;
    }

    private boolean hasSideEffectingOperations(List<StreamOperation> ops) {
        return ops.stream().anyMatch(StreamOperation::isHasSideEffects);
    }

    private boolean hasTerminalShortCircuit(StreamOperation terminal) {
        if (terminal == null) return false;
        return terminal.getType().isShortCircuiting();
    }

    private Set<OperationType> operationTypes(List<StreamOperation> ops) {
        Set<OperationType> types = new LinkedHashSet<>();
        for (StreamOperation op : ops) {
            types.add(op.getType());
        }
        return types;
    }

    private boolean onlyFilterAndMap(List<StreamOperation> ops) {
        return ops.stream().allMatch(op ->
            op.getType() == OperationType.FILTER || op.getType() == OperationType.MAP);
    }

    private boolean hasFilterBeforeMap(List<StreamOperation> ops) {
        int filterIdx = -1;
        int mapIdx = -1;
        for (int i = 0; i < ops.size(); i++) {
            if (ops.get(i).getType() == OperationType.FILTER && filterIdx == -1) filterIdx = i;
            if (ops.get(i).getType() == OperationType.MAP && mapIdx == -1) mapIdx = i;
        }
        return filterIdx >= 0 && mapIdx >= 0 && filterIdx < mapIdx;
    }

    private boolean hasMapBeforeFilter(List<StreamOperation> ops) {
        int filterIdx = -1;
        int mapIdx = -1;
        for (int i = 0; i < ops.size(); i++) {
            if (ops.get(i).getType() == OperationType.FILTER && filterIdx == -1) filterIdx = i;
            if (ops.get(i).getType() == OperationType.MAP && mapIdx == -1) mapIdx = i;
        }
        return filterIdx >= 0 && mapIdx >= 0 && mapIdx < filterIdx;
    }
}
