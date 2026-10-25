from datetime import date, datetime
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.db.models import LifeNode, RoutineRule, TaskOccurrence, Goal


class LifeOSService:
    """Manages the hierarchical Life Tree, routines, daily plan, and next action recommendations."""

    @staticmethod
    def ensure_default_clusters(db: Session) -> None:
        """Seed default Life Tree clusters if the tree is empty."""
        count = db.query(LifeNode).count()
        if count == 0:
            clusters = [
                {"name": "Health & Fitness", "type": "cluster", "description": "Gym, workouts, nutrition, and sleep"},
                {"name": "Personal Life", "type": "cluster", "description": "Home routines, grooming, laundry, and daily maintenance"},
                {"name": "Work & Projects", "type": "cluster", "description": "Professional deliverables, coding, and career"},
                {"name": "Finance & Wealth", "type": "cluster", "description": "Budgets, investments, and expenses"},
                {"name": "Growth & Learning", "type": "cluster", "description": "Reading, books, study, and skills"},
            ]
            created_nodes = {}
            for c in clusters:
                node = LifeNode(name=c["name"], type=c["type"], description=c["description"], importance=1)
                db.add(node)
                db.flush()
                created_nodes[c["name"]] = node

            # Add default initial routine rules
            health_node = created_nodes.get("Health & Fitness")
            if health_node:
                db.add(RoutineRule(
                    node_id=health_node.id,
                    name="Workout or Daily Walk",
                    schedule_type="daily",
                    duration_minutes=30,
                    details="Exercise or 30-minute outdoor walk",
                ))

            personal_node = created_nodes.get("Personal Life")
            if personal_node:
                db.add(RoutineRule(
                    node_id=personal_node.id,
                    name="Wash and Fold Laundry",
                    schedule_type="weekly",
                    weekday=4,  # Friday
                    duration_minutes=45,
                    details="Laundry cycle and folding",
                ))

            growth_node = created_nodes.get("Growth & Learning")
            if growth_node:
                db.add(RoutineRule(
                    node_id=growth_node.id,
                    name="Read 20 Minutes",
                    schedule_type="daily",
                    duration_minutes=20,
                    details="Reading books or technical papers",
                ))

            db.commit()

    @classmethod
    def get_or_generate_due_tasks(cls, db: Session, target_date: Optional[date] = None) -> List[Dict[str, Any]]:
        """Return all tasks due for the specified day (My Day), creating task occurrences if needed."""
        cls.ensure_default_clusters(db)
        today = target_date or date.today()
        weekday = today.weekday()

        # Find active routines
        routines = db.query(RoutineRule).filter(RoutineRule.enabled == True).all()

        for r in routines:
            is_due = False
            if r.schedule_type == "daily":
                is_due = True
            elif r.schedule_type == "weekly" and r.weekday == weekday:
                is_due = True
            elif r.schedule_type == "interval" and r.interval_days:
                last_occurrence = (
                    db.query(TaskOccurrence)
                    .filter(TaskOccurrence.routine_id == r.id, TaskOccurrence.status == "completed")
                    .order_by(TaskOccurrence.due_date.desc())
                    .first()
                )
                if not last_occurrence or (today - last_occurrence.due_date).days >= r.interval_days:
                    is_due = True

            if is_due:
                # Check if task occurrence already exists for this day
                existing = (
                    db.query(TaskOccurrence)
                    .filter(TaskOccurrence.routine_id == r.id, TaskOccurrence.due_date == today)
                    .first()
                )
                if not existing:
                    db.add(TaskOccurrence(
                        routine_id=r.id,
                        title=r.name,
                        due_date=today,
                        status="pending",
                    ))
        db.commit()

        # Query today's occurrences
        occurrences = (
            db.query(TaskOccurrence)
            .filter(TaskOccurrence.due_date == today)
            .order_by(TaskOccurrence.id.asc())
            .all()
        )

        results = []
        for o in occurrences:
            routine = o.routine
            cluster_name = routine.node.name if (routine and routine.node) else "Personal"
            duration = routine.duration_minutes if routine else None
            results.append({
                "id": o.id,
                "title": o.title,
                "cluster": cluster_name,
                "duration_minutes": duration,
                "status": o.status,
                "due_date": o.due_date.isoformat(),
                "completed_at": o.completed_at.isoformat() if o.completed_at else None,
            })
        return results

    @classmethod
    def get_next_best_action(cls, db: Session) -> Dict[str, Any]:
        """Determine next recommended action from today's plan."""
        due_tasks = cls.get_or_generate_due_tasks(db)
        pending = [t for t in due_tasks if t["status"] == "pending"]

        if not pending:
            return {
                "task": "All tasks completed for today!",
                "cluster": "General",
                "why": "You have marked all scheduled routines and tasks complete.",
                "has_pending": False,
            }

        next_task = pending[0]
        duration_str = f" ({next_task['duration_minutes']} min)" if next_task['duration_minutes'] else ""
        return {
            "task": f"{next_task['title']}{duration_str}",
            "cluster": next_task["cluster"],
            "why": f"It is scheduled for today under {next_task['cluster']} and is next in sequence.",
            "has_pending": True,
            "task_id": next_task["id"],
        }

    @classmethod
    def get_life_tree(cls, db: Session) -> List[Dict[str, Any]]:
        """Retrieve full hierarchical Life Tree with cluster stats and active routines."""
        cls.ensure_default_clusters(db)
        clusters = db.query(LifeNode).filter(LifeNode.parent_id == None).all()
        today = date.today()

        tree = []
        for c in clusters:
            routines = c.routines or []
            routine_summaries = []
            overdue_count = 0
            for r in routines:
                # Count overdue occurrences
                overdue = (
                    db.query(TaskOccurrence)
                    .filter(
                        TaskOccurrence.routine_id == r.id,
                        TaskOccurrence.status == "pending",
                        TaskOccurrence.due_date < today,
                    )
                    .count()
                )
                overdue_count += overdue
                routine_summaries.append({
                    "id": r.id,
                    "name": r.name,
                    "schedule_type": r.schedule_type,
                    "duration_minutes": r.duration_minutes,
                    "enabled": r.enabled,
                })

            tree.append({
                "id": c.id,
                "name": c.name,
                "type": c.type,
                "description": c.description,
                "routine_count": len(routines),
                "overdue_count": overdue_count,
                "routines": routine_summaries,
            })
        return tree
