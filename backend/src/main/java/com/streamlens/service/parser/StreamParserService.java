package com.streamlens.service.parser;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;
import com.streamlens.model.OperationInfo;
import com.streamlens.model.ParsedPipeline;
import com.streamlens.service.ir.OperationType;
import com.streamlens.service.ir.StreamOperation;
import com.streamlens.service.ir.StreamPipeline;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class StreamParserService {

    private static final Set<String> STREAM_METHODS = Set.of(
        "filter", "map", "flatMap", "sorted", "distinct", "limit", "skip", "peek",
        "reduce", "collect", "toList", "toSet", "count",
        "findFirst", "findAny", "anyMatch", "allMatch", "noneMatch",
        "mapToInt", "mapToLong", "mapToDouble",
        "mapMulti", "mapMultiToInt", "mapMultiToLong", "mapMultiToDouble",
        "toArray", "toUnmodifiableList", "toUnmodifiableSet", "toUnmodifiableMap",
        "groupingBy", "partitioningBy", "joining", "summarizingInt", "summarizingLong", "summarizingDouble",
        "min", "max"
    );

    private static final Set<String> STREAM_SOURCES = Set.of(
        "stream", "parallelStream", "lines", "of", "empty", "generate", "iterate", "range", "rangeClosed"
    );

    public StreamPipeline parse(String javaCode) {
        try {
            String wrappedCode = wrapIfNecessary(javaCode);
            CompilationUnit cu = StaticJavaParser.parse(wrappedCode);

            StreamPipeline pipeline = new StreamPipeline();
            List<StreamOperation> operations = new ArrayList<>();

            cu.accept(new VoidVisitorAdapter<Void>() {
                @Override
                public void visit(MethodCallExpr n, Void arg) {
                    super.visit(n, arg);
                    String name = n.getNameAsString();

                    if (name.equals("stream") || name.equals("parallelStream")) {
                        pipeline.setParallel(name.equals("parallelStream"));
                        String scope = n.getScope().map(Object::toString).orElse("unknown");
                        pipeline.setSourceType(extractGenericType(scope));
                        pipeline.setCollectionType(scope);
                    } else if (STREAM_METHODS.contains(name)) {
                        OperationType opType = OperationType.fromMethodName(name);
                        if (opType != null) {
                            StreamOperation op = new StreamOperation(opType);
                            op.setRawSource(n.toString());

                            if (!n.getArguments().isEmpty()) {
                                String lambda = n.getArguments().get(0).toString();
                                op.setLambdaExpression(lambda);
                                op.setArgumentExpression(lambda);
                                op.setLambdaBody(extractLambdaBody(lambda));
                            }

                            if (n.getArguments().size() > 1) {
                                String args = n.getArguments().subList(1, n.getArguments().size()).toString();
                                if (op.getArgumentExpression() == null) {
                                    op.setArgumentExpression(args);
                                }
                            }

                            if (opType.isTerminal()) {
                                pipeline.setTerminalOperation(op);
                            } else {
                                op.setIndex(operations.size());
                                operations.add(op);
                            }
                        }
                    }
                }
            }, null);

            pipeline.setIntermediateOperations(operations);
            pipeline.setRawSource(javaCode);

            if (pipeline.getSourceType() == null) {
                pipeline.inferSourceType(javaCode);
            }

            return pipeline;
        } catch (Exception e) {
            return parseWithRegex(javaCode);
        }
    }

    public ParsedPipeline parseToDto(String javaCode) {
        StreamPipeline pipeline = parse(javaCode);
        return convertToDto(pipeline);
    }

    public StreamPipeline parseWithRegex(String javaCode) {
        StreamPipeline pipeline = new StreamPipeline();
        List<StreamOperation> operations = new ArrayList<>();

        Pattern sourcePattern = Pattern.compile("(\\w+(?:<[^>]+>)?)\\.stream\\(\\)");
        Matcher sourceMatcher = sourcePattern.matcher(javaCode);
        if (sourceMatcher.find()) {
            pipeline.setSourceType(extractGenericType(sourceMatcher.group(1)));
            pipeline.setCollectionType(sourceMatcher.group(1));
        }

        Pattern parallelPattern = Pattern.compile("\\.parallelStream\\(\\)");
        if (parallelPattern.matcher(javaCode).find()) {
            pipeline.setParallel(true);
        }

        Pattern opPattern = Pattern.compile(
            "\\.([a-zA-Z]+)\\s*\\(([^)]*(?:\\([^)]*\\)[^)]*)*)\\)"
        );
        Matcher opMatcher = opPattern.matcher(javaCode);

        while (opMatcher.find()) {
            String methodName = opMatcher.group(1);
            String args = opMatcher.group(2);

            if (methodName.equals("stream") || methodName.equals("parallelStream")) continue;

            OperationType opType = OperationType.fromMethodName(methodName);
            if (opType == null) continue;

            StreamOperation op = new StreamOperation(opType);
            op.setRawSource(opMatcher.group(0));
            if (args != null && !args.isEmpty()) {
                op.setLambdaExpression(args.trim());
                op.setArgumentExpression(args.trim());
                op.setLambdaBody(extractLambdaBody(args.trim()));
            }

            if (opType.isTerminal()) {
                pipeline.setTerminalOperation(op);
            } else {
                op.setIndex(operations.size());
                operations.add(op);
            }
        }

        pipeline.setIntermediateOperations(operations);
        pipeline.setRawSource(javaCode);

        if (pipeline.getSourceType() == null) {
            pipeline.inferSourceType(javaCode);
        }

        return pipeline;
    }

    private ParsedPipeline convertToDto(StreamPipeline pipeline) {
        ParsedPipeline dto = new ParsedPipeline();
        dto.setSourceType(pipeline.getSourceType());
        dto.setParallel(pipeline.isParallel());
        dto.setRawSource(pipeline.getRawSource());

        List<OperationInfo> ops = new ArrayList<>();
        for (StreamOperation op : pipeline.getIntermediateOperations()) {
            ops.add(convertOperation(op));
        }
        dto.setOperations(ops);

        if (pipeline.getTerminalOperation() != null) {
            dto.setTerminalOperation(convertOperation(pipeline.getTerminalOperation()));
        }

        return dto;
    }

    private OperationInfo convertOperation(StreamOperation op) {
        OperationInfo info = new OperationInfo();
        info.setIndex(op.getIndex());
        info.setType(op.getType().name());
        info.setDisplayName(op.getType().getMethodName());
        info.setLambdaExpression(op.getLambdaExpression());
        info.setLambdaBody(op.getLambdaBody());
        info.setInputType(op.getInputType());
        info.setOutputType(op.getOutputType());
        info.setCharacteristics(new ArrayList<>(
            op.getCharacteristics().stream().map(Enum::name).toList()
        ));
        info.setStateful(op.isStateful());
        info.setShortCircuiting(op.isShortCircuiting());
        info.setHasSideEffects(op.isHasSideEffects());
        info.setArgumentExpression(op.getArgumentExpression());
        return info;
    }

    private String wrapIfNecessary(String code) {
        if (code.contains("class ") && code.contains("public static")) {
            return code;
        }
        return "import java.util.*;\nimport java.util.stream.*;\npublic class __StreamLensWrapper {\n    public static void run() {\n" + indentCode(code) + "\n    }\n}";
    }

    private String indentCode(String code) {
        StringBuilder sb = new StringBuilder();
        for (String line : code.split("\n")) {
            sb.append("        ").append(line.trim()).append("\n");
        }
        return sb.toString();
    }

    private String extractGenericType(String scope) {
        Pattern p = Pattern.compile("([A-Z][a-zA-Z0-9]*)");
        Matcher m = p.matcher(scope);
        if (m.find()) {
            return m.group(1);
        }
        if (scope.contains("<")) {
            return scope.substring(0, scope.indexOf('<')).trim();
        }
        return scope.trim();
    }

    private String extractLambdaBody(String lambda) {
        if (lambda.contains("->")) {
            String afterArrow = lambda.substring(lambda.indexOf("->") + 2).trim();
            if (afterArrow.startsWith("{")) {
                return afterArrow.substring(1, afterArrow.lastIndexOf("}")).trim();
            }
            return afterArrow;
        }
        return lambda;
    }

    public Map<String, Object> parseToMap(String javaCode) {
        StreamPipeline pipeline = parse(javaCode);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sourceType", pipeline.getSourceType());
        result.put("isParallel", pipeline.isParallel());

        List<Map<String, Object>> ops = new ArrayList<>();
        for (StreamOperation op : pipeline.getIntermediateOperations()) {
            Map<String, Object> opMap = new LinkedHashMap<>();
            opMap.put("index", op.getIndex());
            opMap.put("type", op.getType().name());
            opMap.put("displayName", op.getType().getMethodName());
            opMap.put("lambdaExpression", op.getLambdaExpression());
            opMap.put("stateful", op.isStateful());
            opMap.put("shortCircuiting", op.isShortCircuiting());
            opMap.put("hasSideEffects", op.isHasSideEffects());
            ops.add(opMap);
        }
        result.put("operations", ops);

        if (pipeline.getTerminalOperation() != null) {
            StreamOperation term = pipeline.getTerminalOperation();
            Map<String, Object> termMap = new LinkedHashMap<>();
            termMap.put("type", term.getType().name());
            termMap.put("displayName", term.getType().getMethodName());
            termMap.put("argumentExpression", term.getArgumentExpression());
            result.put("terminalOperation", termMap);
        }

        result.put("rawSource", pipeline.getRawSource());
        return result;
    }
}
