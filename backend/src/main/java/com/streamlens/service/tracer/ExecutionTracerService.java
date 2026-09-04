package com.streamlens.service.tracer;

import com.streamlens.model.ElementTrace;
import com.streamlens.model.TraceResult;
import com.streamlens.model.TraceStep;
import com.streamlens.service.engine.SemanticEquivalenceEngine;
import com.streamlens.service.ir.StreamOperation;
import com.streamlens.service.ir.StreamPipeline;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class ExecutionTracerService {

    private final SemanticEquivalenceEngine equivalenceEngine;

    public ExecutionTracerService(SemanticEquivalenceEngine equivalenceEngine) {
        this.equivalenceEngine = equivalenceEngine;
    }

    public TraceResult trace(StreamPipeline pipeline, List<Integer> input) {
        TraceResult result = new TraceResult();
        result.setPipelineDescription(pipeline.toString());
        result.setElementTraces(new ArrayList<>());

        for (Integer value : input) {
            ElementTrace et = traceElement(pipeline, value);
            result.getElementTraces().add(et);
        }

        return result;
    }

    public Map<String, Object> traceToMap(StreamPipeline pipeline, List<Integer> input) {
        TraceResult traceResult = trace(pipeline, input);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("pipelineDescription", traceResult.getPipelineDescription());

        List<Map<String, Object>> traces = new ArrayList<>();
        for (ElementTrace et : traceResult.getElementTraces()) {
            Map<String, Object> traceMap = new LinkedHashMap<>();
            traceMap.put("inputValue", et.getInputValue());
            traceMap.put("outputValue", et.getOutputValue());
            traceMap.put("accepted", et.isAccepted());

            List<Map<String, Object>> steps = new ArrayList<>();
            for (TraceStep step : et.getSteps()) {
                Map<String, Object> stepMap = new LinkedHashMap<>();
                stepMap.put("operationIndex", step.getOperationIndex());
                stepMap.put("operationType", step.getOperationType());
                stepMap.put("inputValue", step.getInputValue());
                stepMap.put("outputValue", step.getOutputValue());
                stepMap.put("passed", step.isPassed());
                stepMap.put("description", step.getDescription());
                steps.add(stepMap);
            }
            traceMap.put("steps", steps);
            traces.add(traceMap);
        }
        result.put("elementTraces", traces);
        return result;
    }

    private ElementTrace traceElement(StreamPipeline pipeline, int value) {
        ElementTrace et = new ElementTrace();
        et.setInputValue(value);
        et.setSteps(new ArrayList<>());

        int current = value;
        boolean accepted = true;

        for (int i = 0; i < pipeline.getIntermediateOperations().size(); i++) {
            StreamOperation op = pipeline.getIntermediateOperations().get(i);
            int input = current;

            switch (op.getType()) {
                case FILTER -> {
                    Predicate<Integer> pred = parseFilterPredicate(op.getLambdaExpression());
                    accepted = pred.test(current);
                    if (!accepted) {
                        et.getSteps().add(new TraceStep(i, "FILTER", input, null,
                            false, "REJECTED: " + input + " does not satisfy " + formatLambda(op.getLambdaExpression())));
                        et.setAccepted(false);
                        et.setOutputValue(null);
                        return et;
                    }
                    et.getSteps().add(new TraceStep(i, "FILTER", input, input,
                        true, "ACCEPTED: " + input + " passes " + formatLambda(op.getLambdaExpression())));
                }
                case MAP -> {
                    Function<Integer, Integer> mapper = parseMapFunction(op.getLambdaExpression());
                    current = mapper.apply(current);
                    et.getSteps().add(new TraceStep(i, "MAP", input, current,
                        true, "TRANSFORMED: " + input + " → " + current + " via " + formatLambda(op.getLambdaExpression())));
                }
                case SORTED -> {
                    et.getSteps().add(new TraceStep(i, "SORTED", input, input,
                        true, "DEFERRED: sorting is applied to the entire stream"));
                }
                case DISTINCT -> {
                    et.getSteps().add(new TraceStep(i, "DISTINCT", input, input,
                        true, "DEFERRED: distinctness checked after all elements collected"));
                }
                case LIMIT -> {
                    et.getSteps().add(new TraceStep(i, "LIMIT", input, input,
                        true, "PASSED: within limit"));
                }
                case SKIP -> {
                    et.getSteps().add(new TraceStep(i, "SKIP", input, input,
                        true, "PASSED: within skip range"));
                }
                case FLATMAP -> {
                    Function<Integer, List<Integer>> mapper = parseFlatMapFunction(op.getLambdaExpression());
                    List<Integer> mapped = mapper.apply(current);
                    current = mapped.isEmpty() ? current : mapped.get(0);
                    et.getSteps().add(new TraceStep(i, "FLATMAP", input, current,
                        true, "EXPANDED: " + input + " → " + mapped + " (first: " + current + ")"));
                }
                case PEEK -> {
                    et.getSteps().add(new TraceStep(i, "PEEK", input, input,
                        true, "SIDE EFFECT: observed " + input));
                }
                default -> {
                    et.getSteps().add(new TraceStep(i, op.getType().name(), input, input,
                        true, "PASSED: " + op.getType().getMethodName()));
                }
            }
        }

        et.setAccepted(accepted);
        et.setOutputValue(current);
        return et;
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

        Pattern evenPattern = Pattern.compile("(\\w+)\\s*%\\s*2\\s*==\\s*0");
        Matcher evenMatcher = evenPattern.matcher(lambda);
        if (evenMatcher.find()) {
            return x -> x % 2 == 0;
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

        Pattern negatePattern = Pattern.compile("-\\s*(\\w+)");
        Matcher negateMatcher = negatePattern.matcher(lambda);
        if (negateMatcher.find()) {
            return x -> -x;
        }

        return x -> x;
    }

    private Function<Integer, List<Integer>> parseFlatMapFunction(String lambda) {
        if (lambda == null) return x -> List.of(x);
        return x -> List.of(x, x * 2);
    }

    private String formatLambda(String lambda) {
        if (lambda == null) return "???";
        return lambda.length() > 40 ? lambda.substring(0, 37) + "..." : lambda;
    }
}
