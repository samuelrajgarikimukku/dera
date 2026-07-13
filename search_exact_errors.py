import json

path = r"C:\Users\samue\.gemini\antigravity-ide\brain\4c509d48-490c-4efa-ba85-dcf2e4fe3bbf\.system_generated\logs\transcript.jsonl"
with open(path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            # Find any logs that contain console log content with error
            # Or contain stack traces
            serialized = json.dumps(data)
            if "TypeError" in serialized or "ReferenceError" in serialized or "Cannot read property" in serialized or "is not defined" in serialized:
                print(f"Step Index: {data.get('step_index')}")
                # Print occurrences of key terms
                print(serialized[:2000])
                print("="*60)
        except:
            pass
