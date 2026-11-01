#!/bin/sh
# Compiles the real Store.java against tiny stubs of Android and org.json, then runs the test.
set -e
cd "$(dirname "$0")"
OUT=$(mktemp -d)
javac -d "$OUT" $(find stubs -name '*.java') ../../app/src/main/java/za/co/farrusco/farrqcharge/Store.java ../../app/src/main/java/za/co/farrusco/farrqcharge/AlertMerge.java StoreSheetCopyTest.java AlertMergeTest.java
java -cp "$OUT" StoreSheetCopyTest
java -cp "$OUT" AlertMergeTest
