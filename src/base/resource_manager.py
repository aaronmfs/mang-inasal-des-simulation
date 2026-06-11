import simpy
from simpy.resources.resource import Request


class ResourceManager:
    def __init__(self, env: simpy.Environment, capacity: int) -> None:
        self.resource: simpy.Resource = simpy.Resource(env, capacity=capacity)

    def request(self) -> Request:
        return self.resource.request()
