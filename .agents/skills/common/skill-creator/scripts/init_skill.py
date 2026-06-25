#!/usr/bin/env python3
"""
Skill Initializer - Creates a new skill from template

Usage:
    init_skill.py <skill-name> --path <path>

Examples:
    init_skill.py my-new-skill --path skills/public
    init_skill.py my-api-helper --path skills/private
    init_skill.py custom-skill --path /custom/location
"""

import sys
from pathlib import Path


SKILL_TEMPLATE = """---
name: {skill_name}
description: [TODO: Explain what this skill does and when to use it. Include the task boundary and realistic trigger scenarios.]
---

# {skill_title}

## 定位

[TODO: 1-2 句说明本技能解决什么问题，以及它不负责什么。]

## 使用时机

- [TODO: 列出 should-trigger 场景]
- [TODO: 列出 should-not-trigger 或边界场景]

## 工作流

Progress:
- [ ] 1. [TODO: 明确第一步]
- [ ] 2. [TODO: 明确第二步]
- [ ] 3. [TODO: 明确第三步]

## Gotchas

- [TODO: 记录 2-5 条代理容易做错、但不说就会出错的事实]

## 验证

1. [TODO: 描述如何验证结果]
2. [TODO: 若失败，如何修正并重新验证]

## 资源导航

- `scripts/`：放可复用、可重复执行的脚本；没有就留空或删除目录
- `references/`：放按需读取的长文档、规范、Schema
- `assets/`：放模板、样例、图片、字体等输出资源
- `evals/`：维护 `train_queries.json`、`validation_queries.json`、`evals.json`

## 环境依赖（如适用）

- [TODO: 如果依赖特定 IDE、网络、系统工具或仓库目录，在这里说明，并同步补到 frontmatter.compatibility]
"""

EXAMPLE_TRAIN_QUERIES = """[
  {
    "query": "[TODO: 一个应触发该 skill 的真实用户请求]",
    "should_trigger": true
  },
  {
    "query": "[TODO: 一个容易误判、但不应触发该 skill 的近似请求]",
    "should_trigger": false
  }
]
"""

EXAMPLE_VALIDATION_QUERIES = """[
  {
    "query": "[TODO: 一个新的 should-trigger 验证请求]",
    "should_trigger": true
  },
  {
    "query": "[TODO: 一个新的 should-not-trigger 验证请求]",
    "should_trigger": false
  }
]
"""

EXAMPLE_EVALS = """{
  "skill_name": "[TODO: replace-with-skill-name]",
  "evals": [
    {
      "id": 1,
      "prompt": "[TODO: 一个真实任务输入]",
      "expected_output": "[TODO: 成功输出应该达到的效果]",
      "files": [],
      "assertions": [
        "[TODO: 一个可验证断言]"
      ]
    }
  ]
}
"""


def title_case_skill_name(skill_name):
    """Convert hyphenated skill name to Title Case for display."""
    return ' '.join(word.capitalize() for word in skill_name.split('-'))


def init_skill(skill_name, path):
    """
    Initialize a new skill directory with template SKILL.md.

    Args:
        skill_name: Name of the skill
        path: Path where the skill directory should be created

    Returns:
        Path to created skill directory, or None if error
    """
    # Determine skill directory path
    skill_dir = Path(path).resolve() / skill_name

    # Check if directory already exists
    if skill_dir.exists():
        print(f"❌ Error: Skill directory already exists: {skill_dir}")
        return None

    # Create skill directory
    try:
        skill_dir.mkdir(parents=True, exist_ok=False)
        print(f"✅ Created skill directory: {skill_dir}")
    except Exception as e:
        print(f"❌ Error creating directory: {e}")
        return None

    # Create SKILL.md from template
    skill_title = title_case_skill_name(skill_name)
    skill_content = SKILL_TEMPLATE.format(
        skill_name=skill_name,
        skill_title=skill_title
    )

    skill_md_path = skill_dir / 'SKILL.md'
    try:
        skill_md_path.write_text(skill_content)
        print("✅ Created SKILL.md")
    except Exception as e:
        print(f"❌ Error creating SKILL.md: {e}")
        return None

    # Create resource directories and eval skeleton
    try:
        for directory_name in ('scripts', 'references', 'assets', 'evals'):
            (skill_dir / directory_name).mkdir(exist_ok=True)
            print(f"✅ Created {directory_name}/")

        evals_dir = skill_dir / 'evals'
        (evals_dir / 'train_queries.json').write_text(EXAMPLE_TRAIN_QUERIES)
        (evals_dir / 'validation_queries.json').write_text(EXAMPLE_VALIDATION_QUERIES)
        (evals_dir / 'evals.json').write_text(EXAMPLE_EVALS.replace('[TODO: replace-with-skill-name]', skill_name))
        print("✅ Created evals/train_queries.json")
        print("✅ Created evals/validation_queries.json")
        print("✅ Created evals/evals.json")
    except Exception as e:
        print(f"❌ Error creating resource directories: {e}")
        return None

    # Print next steps
    print(f"\n✅ Skill '{skill_name}' initialized successfully at {skill_dir}")
    print("\nNext steps:")
    print("1. Edit SKILL.md to complete the TODO items and update the description")
    print("2. Add compatibility only when the skill really depends on tools, network, or repo layout")
    print("3. Fill train_queries.json, validation_queries.json, and evals.json")
    print("4. Delete any empty resource directories you do not need")
    print("5. Run the validator when ready to check the skill structure")

    return skill_dir


def main():
    if len(sys.argv) < 4 or sys.argv[2] != '--path':
        print("Usage: init_skill.py <skill-name> --path <path>")
        print("\nSkill name requirements:")
        print("  - Hyphen-case identifier (e.g., 'data-analyzer')")
        print("  - Lowercase letters, digits, and hyphens only")
        print("  - Max 64 characters")
        print("  - Must match directory name exactly")
        print("\nExamples:")
        print("  init_skill.py my-new-skill --path skills/public")
        print("  init_skill.py my-api-helper --path skills/private")
        print("  init_skill.py custom-skill --path /custom/location")
        sys.exit(1)

    skill_name = sys.argv[1]
    path = sys.argv[3]

    print(f"🚀 Initializing skill: {skill_name}")
    print(f"   Location: {path}")
    print()

    result = init_skill(skill_name, path)

    if result:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
